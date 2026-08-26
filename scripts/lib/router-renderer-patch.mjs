import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { transform as transformJavaScript } from "esbuild";

const REGISTRY_BEFORE = 'const wDn=[{id:"general",label:"General",icon:"settings-gear"},{id:"usage",label:"Usage & Billing",icon:"chart-bars"},{id:"beta",label:"Updates",icon:"cloud-download"}]';
const REGISTRY_AFTER = 'const wDn=[{id:"general",label:"General",icon:"settings-gear"},{id:"router",label:"Router",icon:"git-branch"},{id:"usage",label:"Usage & Billing",icon:"chart-bars"},{id:"beta",label:"Updates",icon:"cloud-download"}]';
const GENERAL_BEFORE = 'Q=x==="general"?a.jsx(Te,{children:a.jsx(Sa,{auth:t})}):null';
const GENERAL_AFTER = 'Q=x==="general"?a.jsx(Te,{children:a.jsx(Sa,{auth:t})}):x==="router"?a.jsx(RRouterPanel,{}):null';
const USAGE_BEFORE = 'Z=x==="usage"?a.jsx(Te,{children:a.jsx(Na,{})}):null';
const USAGE_AFTER = 'Z=x==="usage"?a.jsx(Te,{children:a.jsx(RRouterUsage,{})}):null';
const COMPONENT_ANCHOR = 'function Sa(s){';
const TRANSCRIPT_DEDUPE_BEFORE = 'const r=s?UIn(n):n,i=[];let o=null;const l=new Set;let c=null,u=!1;const d=e==null?t:null;let m=!1;for(const f of r){';
const TRANSCRIPT_DEDUPE_AFTER = 'const RTranscriptSource=s?UIn(n):n,RTranscriptIdCounts=new Map,r=[...RTranscriptSource].sort((f,h)=>(f.timestampMs??0)-(h.timestampMs??0)).map((f,h)=>{const v=RTranscriptIdCounts.get(f.id)??0;return RTranscriptIdCounts.set(f.id,v+1),v===0?f:{...f,id:f.id+"~"+String(f.timestampMs??h)+"~"+v}}),i=[];let o=null;const l=new Set;let c=null,u=!1;const d=e==null?t:null;let m=!1;for(const f of r){';
const LANDING_COMPONENT_ANCHOR = 'function gjn(n){';
const LANDING_COMPONENT_SOURCE = String.raw`function RRouterLandingCta(s){const e=re("sand-78zum5 sand-dt5ytf sand-6s0dn4 sand-1nejdyq"),t=Fe(Ut.body2,VD.waitingSeparator);return p.jsxs("div",{className:e,style:{paddingTop:6},children:[p.jsx("span",{className:t.className,style:t.style,children:"Continue without signing in"}),p.jsx(Qs,{"aria-label":"Configure 9Router",onClick:s.onOpenRouterSettings,style:VD.textAction,variant:"tertiary",children:"Configure 9Router"})]})}
`;
const LANDING_SWITCH_BEFORE = 'case"landing":return p.jsx("div",{className:"sand-10l6tqk sand-10a8y8t sand-rvj5dj sand-1ku5rj1 sand-b3r6kr",children:p.jsx(gjn,{auth:r,headingId:xn,onSignIn:Ve})});';
const LANDING_SWITCH_AFTER = 'case"landing":return p.jsx("div",{className:"sand-10l6tqk sand-10a8y8t sand-rvj5dj sand-1ku5rj1 sand-b3r6kr",children:p.jsx(gjn,{auth:r,headingId:xn,onOpenRouterSettings:()=>q("router"),onSignIn:Ve})});';
const LANDING_GJN_HEAD_BEFORE = 'function gjn(n){const e=he.c(7),{headingId:t,auth:s,onSignIn:r}=n,';
const LANDING_GJN_HEAD_AFTER = 'function gjn(n){const e=he.c(8),{headingId:t,auth:s,onSignIn:r,onOpenRouterSettings:u}=n,';
const LANDING_GJN_BODY_BEFORE = 'let o;e[0]!==s||e[1]!==i||e[2]!==r?(o=i?p.jsx(kjn,{auth:s}):p.jsxs(p.Fragment,{children:[p.jsx(p0t,{autoFocus:!0,disabled:!s.isLoaded,onClick:r,trailingIcon:"arrow-right",children:"Sign in"}),s.error!=null?p.jsx(yjn,{message:s.error}):null]}),e[0]=s,e[1]=i,e[2]=r,e[3]=o):o=e[3];';
const LANDING_GJN_BODY_AFTER = 'let o;e[0]!==s||e[1]!==i||e[2]!==r||e[7]!==u?(o=i?p.jsx(kjn,{auth:s}):p.jsxs(p.Fragment,{children:[p.jsx(p0t,{autoFocus:!0,disabled:!s.isLoaded,onClick:r,trailingIcon:"arrow-right",children:"Sign in"}),p.jsx(RRouterLandingCta,{onOpenRouterSettings:u}),s.error!=null?p.jsx(yjn,{message:s.error}):null]}),e[0]=s,e[1]=i,e[2]=r,e[3]=o,e[7]=u):o=e[3];';
const NAV_ITEM_LABEL_BEFORE = 'xe(We.navItem,Rs.interactive,be&&We.navItemActive).className),"data-active":be||void 0,';
const NAV_ITEM_LABEL_AFTER = 'xe(We.navItem,Rs.interactive,be&&We.navItemActive).className+(fe.id==="beta"?" sand-4b2ntj":"")),"data-active":be||void 0,';
const NAV_ITEM_ICON_BEFORE = 'className:{0:{className:"sand-9f619 sand-1wd3ewq"},1:{className:"sand-9f619 sand-1wd3ewq"}}[!!be<<0].className??"",name:fe.icon,size:15';
const NAV_ITEM_ICON_AFTER = 'className:fe.id==="beta"?"sand-9f619 sand-4b2ntj":({0:{className:"sand-9f619 sand-1wd3ewq"},1:{className:"sand-9f619 sand-1wd3ewq"}}[!!be<<0].className??""),name:fe.icon,size:15';
const WINDOW_CHROME_TONE_BEFORE = 'p.jsx(xPe,{isOverlayTone:c})';
const WINDOW_CHROME_TONE_AFTER = 'p.jsx(xPe,{isOverlayTone:c||r===na.settings})';
const ONBOARDING_CHROME_TONE_BEFORE = 'let Ft;e[110]!==Be?(Ft=p.jsx(Be,{}),e[110]=Be,e[111]=Ft):Ft=e[111];';
const ONBOARDING_CHROME_TONE_AFTER = 'let Ft;e[110]!==Be||e[131]!==R?(Ft=p.jsx(Be,{isOverlayTone:R!=null}),e[110]=Be,e[131]=R,e[111]=Ft):Ft=e[111];';
const ONBOARDING_MEMO_SIZE_BEFORE = 'const e=he.c(131),{onComplete:t,presentation:s}=n';
const ONBOARDING_MEMO_SIZE_AFTER = 'const e=he.c(132),{onComplete:t,presentation:s}=n';
const COMPONENT_SOURCE = String.raw`
const RRouterProviders=[
  {value:"cursor",label:"Cursor",description:"Use your signed-in Cursor account.",kind:"account"},
  {value:"claude-code",label:"Claude Code",description:"Use your existing Claude Code sign-in and Grok Bot's connected plugins.",kind:"local",localKey:"claude-code"},
  {value:"codex",label:"Codex",description:"Use your existing ChatGPT sign-in from Codex with Grok Bot's connected plugins.",kind:"local",localKey:"codex"},
  {value:"openrouter",label:"OpenRouter",description:"Route through your OpenRouter account and selected model.",kind:"key",secret:"OPENROUTER_API_KEY"},
  {value:"cli-proxy",label:"OpenAI-compatible / 9Router",description:"Route through local 9Router at 127.0.0.1:20128 or another reviewed OpenAI-compatible endpoint.",kind:"proxy"}
],RRouterOptions=RRouterProviders.map(s=>({value:s.value,label:s.label})),RRouterEmptyUsage={requests:0,inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,lastUsedAt:null},RRouterInputClass="sand-9f619 sand-h8yej3 sand-5f5z56 sand-u97haq sand-lrnmfh sand-uve7l6 sand-16b7oty sand-1rgtt3y sand-o7x2bt sand-mkeg23 sand-1y0btm7 sand-qz0629 sand-1043rbw sand-13l7odt sand-1wd3ewq sand-jb2p0i sand-4z9k3i sand-frs9s4 sand-tt52l0 sand-1odjw0f sand-1t137rt sand-ltfok3";
async function RRouterRefreshLocalWorkspace(){try{await window.desktop.forceGatewayReconnect()}catch{}window.dispatchEvent(new Event("sand-local-workspace-changed"))}
function RRouterState(){
  const[s,e]=de.useState({provider:"cursor",usage:null,local:null,error:null});
  de.useEffect(()=>{let t=!0;const n=r=>{t&&e(r.detail)};window.addEventListener("sand-router-provider-changed",n);window.desktop.agent.getInferenceRouter().then(r=>{t&&e({...r,error:null})}).catch(r=>{t&&e(i=>({...i,error:String(r?.message??r)}))});return()=>{t=!1;window.removeEventListener("sand-router-provider-changed",n)}},[]);
  const t=async n=>{const r=s;e(i=>({...i,provider:n,error:null}));try{const i=await window.desktop.agent.setInferenceRouter(n),o={...i,error:null};e(o);window.dispatchEvent(new CustomEvent("sand-router-provider-changed",{detail:o}));await RRouterRefreshLocalWorkspace()}catch(i){e({...r,error:String(i?.message??i)})}};
  return[s,t]
}
function RRouterSecrets(){const[s,e]=de.useState([]),[t,n]=de.useState(0);de.useEffect(()=>{let r=!0;window.desktop.secrets.list().then(i=>{r&&e(Array.isArray(i?.keys)?i.keys:[])});return()=>{r=!1}},[t]);return[s,()=>n(r=>r+1)]}
function RRouterNumber(s){return new Intl.NumberFormat().format(s)}
function RRouterOrigin(s){try{return new URL(s.trim()).origin}catch{return null}}
function RRouterSwitch({checked:s,disabled:e,label:t,onToggle:n}){return a.jsx("button",{"aria-checked":s,"aria-label":t,disabled:e,onClick:()=>n(!s),role:"switch",style:{appearance:"none",background:s?"var(--color-accent-primary, #4f8cff)":"rgba(255,255,255,.14)",border:0,borderRadius:999,cursor:e?"wait":"pointer",height:22,opacity:e?0.65:1,padding:2,position:"relative",transition:"background .15s ease",width:38},type:"button",children:a.jsx("span",{style:{background:"white",borderRadius:"50%",boxShadow:"0 1px 3px rgba(0,0,0,.35)",display:"block",height:18,transform:"translateX("+(s?16:0)+"px)",transition:"transform .15s ease",width:18}})})}
function RRouterCliProxy(){
  const[s,e]=de.useState(null),[t,n]=de.useState(""),[r,i]=de.useState(""),[o,l]=de.useState("chat-completions"),[c,d]=de.useState(""),[u,p]=de.useState(!1),[x,j]=de.useState(!1),[m,h]=de.useState(!1),q=de.useRef(""),z=de.useRef(null),E=de.useRef(""),V=de.useRef(0),R=()=>{V.current+=1;q.current="";z.current=null;d("")},g=v=>{e(v);if(q.current.trim()&&(z.current===null||RRouterOrigin(v.baseUrl)!==z.current))R();E.current=v.baseUrl;n(v.baseUrl);i(v.model);l(v.protocol);p(v.allowRemoteHttps===!0);j(v.allowTailscaleHttp===!0)};
  de.useEffect(()=>{let v=!0;window.desktop.cliProxy.status().then(y=>{v&&g(y)});return()=>{v=!1}},[]);
  const f=async()=>{const v=V.current,y=z.current,A=()=>{if(V.current!==v||z.current!==y)return;R()};h(!0);try{g(await window.desktop.cliProxy.save({baseUrl:t,model:r,protocol:o,allowRemoteHttps:u,allowTailscaleHttp:x,...(c.trim()?{apiKey:c}:{})},A));await RRouterRefreshLocalWorkspace()}finally{h(!1)}},b=async()=>{h(!0);try{g(await window.desktop.cliProxy.remove());R();await RRouterRefreshLocalWorkspace()}finally{h(!1)}},w=async()=>{h(!0);try{g(await window.desktop.cliProxy.status({testConnection:!0}))}finally{h(!1)}};
  return a.jsx(re,{title:"9Router connection",children:a.jsxs("div",{children:[
    a.jsx(ie,{description:"Authenticated /v1 root only. For this Tailscale server, use http://100.112.10.8:20128/v1. Never use /codex.",label:"Base URL",variant:"card",children:a.jsx("input",{"aria-label":"9Router Base URL",className:RRouterInputClass,disabled:m,onChange:v=>{const y=v.currentTarget.value;if(q.current.trim()&&(z.current===null||RRouterOrigin(y)!==z.current))R();E.current=y;n(y)},spellCheck:!1,style:{fontSize:13,height:34,padding:"0 10px",width:270},type:"url",value:t})}),
    a.jsx(ie,{divided:!0,description:"If unknown, save the key first, run Test & load models, choose one, then save again. Manual entry stays available when /v1/models omits a model.",label:"Model ID",variant:"card",children:a.jsxs("div",{children:[a.jsx("input",{"aria-label":"9Router model",className:RRouterInputClass,disabled:m,list:"sand-9router-models",onChange:v=>i(v.currentTarget.value),placeholder:"provider/model-id",spellCheck:!1,style:{fontSize:13,height:34,padding:"0 10px",width:270},value:r}),a.jsx("datalist",{id:"sand-9router-models",children:s?.probe?.models?.map(v=>a.jsx("option",{value:v},v))})]})}),
    a.jsx(ie,{divided:!0,description:s?.configured?"A required proxy/client API key is saved. Leave this blank to keep it.":"Required. Use the 9Router proxy/client API key, not the management key.",label:"API key",variant:"card",children:a.jsx("input",{"aria-label":"9Router API key",autoComplete:"new-password",className:RRouterInputClass,disabled:m,onChange:v=>{const y=v.currentTarget.value;V.current+=1;q.current=y;z.current=y.trim()?RRouterOrigin(E.current):null;d(y)},placeholder:s?.configured?"Saved key (enter to replace)":"Proxy API key",style:{fontSize:13,height:34,padding:"0 10px",width:270},type:"password",value:c})}),
    a.jsx(ie,{divided:!0,description:"Use Chat Completions or Auto for the full Local Docker tool loop; explicit Responses is blocked for native-agent turns.",label:"Protocol",variant:"card",children:a.jsx(ye,{"aria-label":"9Router protocol",onValueChange:v=>{if(v!==null)l(v)},options:[{value:"chat-completions",label:"Chat Completions (full tools)"},{value:"responses",label:"Responses (not for Local Docker)"},{value:"auto",label:"Auto (Chat first)"}],placement:"bottom-end",size:"lg",value:o,variant:"filled"})}),
    a.jsx(ie,{divided:!0,description:"Allow plain HTTP only to numeric Tailscale addresses (verify with tailscale ping).",label:"Tailscale HTTP",variant:"card",children:a.jsx(RRouterSwitch,{checked:x,disabled:m,label:"Allow HTTP over Tailscale",onToggle:j})}),
    a.jsx(ie,{divided:!0,description:"Allow a remote HTTPS endpoint (advanced; does not allow arbitrary HTTP).",label:"Remote HTTPS",variant:"card",children:a.jsx(RRouterSwitch,{checked:u,disabled:m,label:"Allow a remote HTTPS endpoint",onToggle:p})}),
    a.jsx("div",{style:{display:"grid",padding:"0 var(--cursor-spacing-3-5, 14px) var(--cursor-spacing-3, 12px)"},children:[
    a.jsx("div",{style:{display:"flex",gap:8,justifyContent:"flex-end",padding:"10px 0"},children:[a.jsx(oe,{disabled:m||!s?.configured,onClick:b,shape:"rectangular",size:"sm",variant:"secondary",children:"Delete credential"}),a.jsx(oe,{disabled:m||!s?.configured,onClick:w,shape:"rectangular",size:"sm",variant:"secondary",children:"Test & load models"}),a.jsx(oe,{disabled:m||!t.trim()||(!s?.configured&&!c.trim()),onClick:f,shape:"rectangular",size:"sm",variant:"primary",children:m?"Saving…":"Save 9Router"})]}),
    a.jsx(se,{as:"p",color:"secondary",size:"sm",children:"Use the current stable 9Router release (v0.5.35 when reviewed); older builds have known authorization bypasses. Local Docker enables built-in agent, shell, file, browser, and computer tools; account-bound cloud features remain unavailable without sign-in."}),
    a.jsx(se,{as:"p",color:"secondary",size:"sm",children:s==null?"Loading status…":s.configured?s.isPersistent?"Credential is encrypted by the operating system.":"Credential is held for this session only.":"Not configured."}),
    s?.probe?a.jsx(se,{as:"p",color:"secondary",size:"sm",children:s.probe.message+" ("+s.probe.latencyMs+" ms)"}):null
    ]})
  ]})})
}
function RRouterCredential({provider:s,state:e,keys:t,onSaved:n}){const[r,i]=de.useState(""),[o,l]=de.useState(!1);if(s.kind==="account")return a.jsx(se,{as:"span",color:"secondary",size:"sm",children:"Signed in"});if(s.kind==="local"){const c=e.local?.[s.localKey],d=c?.installed&&c?.authenticated;return a.jsx(se,{as:"span",color:d?"primary":"secondary",size:"sm",children:d?"Ready":c?.installed?"Sign in with "+(s.value==="codex"?"codex login":"claude"):"Not installed"})}const c=t.includes(s.secret),d=async()=>{if(r.trim().length===0)return;l(!0);try{await window.desktop.secrets.upsert({[s.secret]:r.trim()}),i(""),n()}finally{l(!1)}};return a.jsxs("div",{className:"sand-9f619 sand-78zum5 sand-6s0dn4 sand-h8yej3",style:{width:360},children:[a.jsx("input",{"aria-label":s.secret,className:RRouterInputClass,disabled:o,onChange:u=>i(u.currentTarget.value),placeholder:c?"Replace saved key":"Paste API key",style:{fontSize:13,height:34,minWidth:0,padding:"0 10px",width:270},type:"password",value:r}),a.jsx(oe,{disabled:o||r.trim().length===0,onClick:d,shape:"rectangular",size:"sm",variant:"secondary",children:o?"Saving…":"Save"})]})}
function RRouterUsageRows({usage:s}){return a.jsxs("div",{children:[a.jsx(ie,{label:"Requests",variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:RRouterNumber(s.requests)})}),a.jsx(ie,{divided:!0,label:"Input tokens",variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:RRouterNumber(s.inputTokens)})}),a.jsx(ie,{divided:!0,label:"Output tokens",variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:RRouterNumber(s.outputTokens)})}),a.jsx(ie,{divided:!0,label:"Cache tokens",variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:RRouterNumber(s.cacheReadTokens+s.cacheWriteTokens)})}),a.jsx(ie,{divided:!0,label:"Last used",variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:s.lastUsedAt?new Date(s.lastUsedAt).toLocaleString():"Not used yet"})})]})}
function RBoxRuntime(){const[s,e]=de.useState({mode:"remote",status:null,error:null,busy:!0});de.useEffect(()=>{let t=!0;window.desktop.agent.getBoxRuntime().then(n=>{t&&e({...n,error:null,busy:!1})}).catch(n=>{t&&e(r=>({...r,error:String(n?.message??n),busy:!1}))});return()=>{t=!1}},[]);const t=s.mode==="local-docker",n=async()=>{const r=t?"remote":"local-docker";e(i=>({...i,mode:r,busy:!0,error:null}));try{const i=await window.desktop.agent.setBoxRuntime(r);e({...i,error:null,busy:!1});await RRouterRefreshLocalWorkspace()}catch(i){e(o=>({...o,mode:t?"local-docker":"remote",error:String(i?.message??i),busy:!1}))}};return a.jsxs("div",{children:[a.jsx(ie,{description:t?(s.status?.detail??"Shell, files and computer use run in a Docker container on this computer."):"Shell, files and computer use run on Grok Bot's remote computer.",label:"Use local Docker VM",variant:"card",children:a.jsx("button",{"aria-checked":t,"aria-label":"Use local Docker VM",disabled:s.busy,onClick:n,role:"switch",style:{appearance:"none",background:t?"var(--color-accent-primary, #4f8cff)":"rgba(255,255,255,.14)",border:0,borderRadius:999,cursor:s.busy?"wait":"pointer",height:22,opacity:s.busy?0.65:1,padding:2,position:"relative",transition:"background .15s ease",width:38},type:"button",children:a.jsx("span",{style:{background:"white",borderRadius:"50%",boxShadow:"0 1px 3px rgba(0,0,0,.35)",display:"block",height:18,transform:"translateX("+(t?16:0)+"px)",transition:"transform .15s ease",width:18}})})}),s.error?a.jsx("div",{style:{display:"grid",padding:"0 var(--cursor-spacing-3-5, 14px) var(--cursor-spacing-3, 12px)"},children:a.jsx(se,{as:"p",color:"red",size:"sm",children:s.error})}):null]})}
function RRouterPanel(){const[s,e]=RRouterState(),[t,n]=RRouterSecrets(),r=RRouterProviders.find(i=>i.value===s.provider)??RRouterProviders[0],i=s.usage?.providers?.[s.provider]??RRouterEmptyUsage,o=r.value==="codex"?"Uses the private ChatGPT login already stored by Codex on this computer. Requests are made by Grok Bot directly.":r.kind==="local"?"Uses Claude Code's existing login on this computer.":r.kind==="key"?"Stored securely with your other Grok Bot secrets.":"Uses the account already connected to Grok Bot.";return a.jsx(Te,{children:a.jsxs("div",{className:k("sand-settings-general","sand-9f619 sand-78zum5 sand-dt5ytf sand-3qzy4x"),children:[a.jsx(re,{title:"Routing",children:a.jsx(ie,{description:r.description,label:"Provider",variant:"card",children:a.jsx(ye,{"aria-label":"Routing provider",onValueChange:l=>{if(l!==null)void e(l)},options:RRouterOptions,placement:"bottom-end",size:"lg",value:s.provider,variant:"filled"})})}),a.jsx(re,{title:"Computer",children:a.jsx(RBoxRuntime,{})}),r.kind==="proxy"?a.jsx(RRouterCliProxy,{}):a.jsx(re,{title:r.kind==="key"?"OpenRouter account":"Account",children:a.jsx(ie,{description:o,label:r.kind==="key"?"API key":"Status",variant:"card",children:a.jsx(RRouterCredential,{provider:r,state:s,keys:t,onSaved:n})})}),s.error?a.jsx(se,{as:"p",color:"red",size:"sm",children:s.error}):null,a.jsx(re,{title:"Usage for "+r.label,children:a.jsx(RRouterUsageRows,{usage:i})})]})})}
function RRouterUsageSummary({provider:s,usage:e,current:t,divided:n}){const r=[RRouterNumber(e.requests)+" requests",RRouterNumber(e.inputTokens)+" input",RRouterNumber(e.outputTokens)+" output",RRouterNumber(e.cacheReadTokens+e.cacheWriteTokens)+" cached"].join(" · "),i=t?"Current route":e.lastUsedAt?new Date(e.lastUsedAt).toLocaleString():"Not used yet";return a.jsx(ie,{divided:n,description:r,label:s.label,variant:"card",children:a.jsx(se,{as:"span",color:t?"primary":"secondary",size:"sm",children:i})})}
function RRouterUsage(){const[s]=RRouterState(),e=RRouterProviders.find(t=>t.value===s.provider)??RRouterProviders[0],t=RRouterProviders.filter(n=>n.value===s.provider||(s.usage?.providers?.[n.value]?.requests??0)>0);return a.jsxs("div",{className:k("sand-usage-section","sand-9f619 sand-78zum5 sand-dt5ytf sand-ou54vl"),children:[a.jsx(re,{title:"Current provider",children:a.jsx(ie,{description:e.description,label:e.label,variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:"Selected"})})}),a.jsx(re,{title:"Tracked activity",children:a.jsx("div",{children:t.map((n,r)=>a.jsx(RRouterUsageSummary,{provider:n,usage:s.usage?.providers?.[n.value]??RRouterEmptyUsage,current:n.value===s.provider,divided:r>0},n.value))})}),s.provider==="cursor"?a.jsx(Na,{}):null]})}
`;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + 1) >= 0) throw new Error(`Original renderer ${label} anchor is missing or ambiguous.`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

async function assertPatchedParses(code, label, name) {
  try {
    await transformJavaScript(code, {
      charset: "utf8",
      format: "esm",
      legalComments: "none",
      loader: "js",
      target: "chrome120",
    });
  } catch (error) {
    const failure = error?.errors?.[0];
    const location = failure?.location;
    const where = location == null ? "" : ` at ${location.line}:${location.column}`;
    const detail = failure?.text ?? error?.message ?? String(error);
    throw new Error(`Original renderer ${label} patch produced invalid JavaScript in ${name}${where}: ${detail}`);
  }
}

export function patchOriginalSettingsRegistry(source) {
  return replaceExactlyOnce(source, REGISTRY_BEFORE, REGISTRY_AFTER, "settings registry");
}

export function patchOriginalSettingsNavMute(source) {
  let patched = replaceExactlyOnce(source, NAV_ITEM_LABEL_BEFORE, NAV_ITEM_LABEL_AFTER, "settings nav label mute");
  patched = replaceExactlyOnce(patched, NAV_ITEM_ICON_BEFORE, NAV_ITEM_ICON_AFTER, "settings nav icon mute");
  return patched;
}

export function patchOriginalSettingsPanel(source) {
  let patched = replaceExactlyOnce(source, COMPONENT_ANCHOR, `${COMPONENT_SOURCE}${COMPONENT_ANCHOR}`, "component insertion");
  patched = replaceExactlyOnce(patched, GENERAL_BEFORE, GENERAL_AFTER, "Router panel switch");
  patched = replaceExactlyOnce(patched, USAGE_BEFORE, USAGE_AFTER, "Usage panel switch");
  patched = patchOriginalSettingsNavMute(patched);
  return patched;
}

export function patchOriginalTranscriptRows(source) {
  return replaceExactlyOnce(source, TRANSCRIPT_DEDUPE_BEFORE, TRANSCRIPT_DEDUPE_AFTER, "transcript chronology and row identity normalization");
}

export function patchOriginalLandingEntry(source) {
  let patched = replaceExactlyOnce(source, LANDING_COMPONENT_ANCHOR, `${LANDING_COMPONENT_SOURCE}${LANDING_COMPONENT_ANCHOR}`, "landing router entry component insertion");
  patched = replaceExactlyOnce(patched, LANDING_GJN_HEAD_BEFORE, LANDING_GJN_HEAD_AFTER, "landing entry prop wiring");
  patched = replaceExactlyOnce(patched, LANDING_GJN_BODY_BEFORE, LANDING_GJN_BODY_AFTER, "landing entry CTA insertion");
  patched = replaceExactlyOnce(patched, LANDING_SWITCH_BEFORE, LANDING_SWITCH_AFTER, "landing router entry switch");
  return patched;
}

export function patchOriginalWindowChromeTone(source) {
  let patched = replaceExactlyOnce(source, WINDOW_CHROME_TONE_BEFORE, WINDOW_CHROME_TONE_AFTER, "window chrome overlay tone");
  patched = replaceExactlyOnce(patched, ONBOARDING_CHROME_TONE_BEFORE, ONBOARDING_CHROME_TONE_AFTER, "onboarding window chrome overlay tone");
  patched = replaceExactlyOnce(patched, ONBOARDING_MEMO_SIZE_BEFORE, ONBOARDING_MEMO_SIZE_AFTER, "onboarding window chrome memo slot");
  return patched;
}

export async function applyOriginalRendererRouterPatch({ stageRoot }) {
  const assetsRoot = path.join(stageRoot, "dist", "renderer", "assets");
  const registryCandidates = [];
  const panelCandidates = [];
  const transcriptCandidates = [];
  const landingCandidates = [];
  const windowChromeCandidates = [];
  for (const name of await readdir(assetsRoot)) {
    if (!name.endsWith(".js")) continue;
    const target = path.join(assetsRoot, name);
    const source = await readFile(target, "utf8");
    if (source.includes(REGISTRY_BEFORE)) registryCandidates.push({ name, target, source });
    if (source.includes(COMPONENT_ANCHOR) && source.includes(GENERAL_BEFORE) && source.includes(USAGE_BEFORE) && source.includes(NAV_ITEM_LABEL_BEFORE) && source.includes(NAV_ITEM_ICON_BEFORE)) panelCandidates.push({ name, target, source });
    if (source.includes(TRANSCRIPT_DEDUPE_BEFORE)) transcriptCandidates.push({ name, target, source });
    if (source.includes(LANDING_SWITCH_BEFORE) && source.includes(LANDING_GJN_HEAD_BEFORE) && source.includes(LANDING_GJN_BODY_BEFORE) && source.includes(LANDING_COMPONENT_ANCHOR)) landingCandidates.push({ name, target, source });
    if (source.includes(WINDOW_CHROME_TONE_BEFORE) && source.includes(ONBOARDING_CHROME_TONE_BEFORE) && source.includes(ONBOARDING_MEMO_SIZE_BEFORE)) windowChromeCandidates.push({ name, target, source });
  }
  if (registryCandidates.length !== 1 || panelCandidates.length !== 1 || transcriptCandidates.length !== 1 || landingCandidates.length !== 1 || windowChromeCandidates.length !== 1) {
    throw new Error(`Expected one original Settings registry, panel, transcript, landing, and window chrome chunk, found ${registryCandidates.length}/${panelCandidates.length}/${transcriptCandidates.length}/${landingCandidates.length}/${windowChromeCandidates.length}.`);
  }
  const files = new Map();
  for (const [role, candidate, transform] of [
    ["registry", registryCandidates[0], patchOriginalSettingsRegistry],
    ["landing", landingCandidates[0], patchOriginalLandingEntry],
    ["panel", panelCandidates[0], patchOriginalSettingsPanel],
    ["transcript", transcriptCandidates[0], patchOriginalTranscriptRows],
    ["window-chrome", windowChromeCandidates[0], patchOriginalWindowChromeTone],
  ]) {
    let file = files.get(candidate.target);
    if (file == null) {
      file = { name: candidate.name, target: candidate.target, source: candidate.source, roles: [], transforms: [] };
      files.set(candidate.target, file);
    }
    file.roles.push(role);
    file.transforms.push(transform);
  }
  const changes = [];
  for (const file of files.values()) {
    let patched = file.source;
    for (const transform of file.transforms) patched = transform(patched);
    await assertPatchedParses(patched, file.roles.join("+"), file.name);
    await writeFile(file.target, patched);
    changes.push({
      role: file.roles.includes("panel") ? "panel" : "registry",
      path: `dist/renderer/assets/${file.name}`,
      original: { bytes: Buffer.byteLength(file.source), sha256: sha256(file.source) },
      patched: { bytes: Buffer.byteLength(patched), sha256: sha256(patched) },
    });
  }
  const record = {
    schemaVersion: 1,
    mode: "original-renderer-settings-extension",
    chunks: changes,
    features: ["settings-router-provider", "settings-local-docker-vm", "settings-landing-router-entry", "settings-updates-nav-muted", "usage-current-provider", "transcript-chronology", "transcript-row-id-normalization", "settings-window-chrome-tone", "settings-window-chrome-tone-onboarding"],
    transformations: ["settings-registry", "landing-router-entry", "router-panel", "usage-panel", "settings-updates-nav-mute", "transcript-chronology-and-row-identity", "window-chrome-overlay-tone", "onboarding-window-chrome-overlay-tone"],
  };
  const provenancePath = path.join(stageRoot, "dist", "renderer-router-extension.json");
  await writeFile(provenancePath, `${JSON.stringify(record, null, 2)}\n`);
  return { ...record, provenancePath, provenanceBytes: (await stat(provenancePath)).size };
}
