import { createCursorAuthWiring, type AuthServicePort } from "../account/cursor-auth-wiring.js";
import type { SandAuthStatus } from "../account/cursor-auth.js";
import type { ElectronProductionAdapterBindings } from "../production-adapters.js";
import type { ProductionAccountService, ProductionServiceContext } from "../main-production-services.js";
import { getLocalInferenceCliStatus } from "../../shared/node/inference-router-local.js";
import { requireFunction, requireObject } from "./provider-guards.js";

type CursorAuthWiringDeps = Parameters<typeof createCursorAuthWiring>[0];

export interface ProductionAccountOAuthPorts {
  readonly resolveWiringDeps?: (context: ProductionServiceContext) => CursorAuthWiringDeps;
}

function accountRuntimeOf(context: ProductionServiceContext): ReturnType<CursorAuthWiringDeps["getAccountRuntime"]> {
  try {
    const runtime = context.requireCoordinator().getAccountRuntime?.();
    if (runtime != null && typeof (runtime as { observe?: unknown }).observe === "function" && typeof (runtime as { whenIdle?: unknown }).whenIdle === "function") {
      return runtime as ReturnType<CursorAuthWiringDeps["getAccountRuntime"]>;
    }
  } catch {
    // Account construction precedes coordinator construction. The auth wiring
    // must deliver directly until the coordinator exposes its settled runtime.
  }
  return null;
}

function defaultWiringDeps(context: ProductionServiceContext): CursorAuthWiringDeps {
  requireFunction(context.native?.shell?.openExternal, "electron.shell.openExternal");
  requireFunction(context.settings?.settingsStore?.getLocalToolPermission, "account settings.getLocalToolPermission");
  requireFunction(context.settings?.settingsStore?.setLocalToolPermissionCeiling, "account settings.setLocalToolPermissionCeiling");
  requireFunction(context.requireMainEdge, "account main-edge");
  requireFunction(context.coordinatorLegs?.legs?.setHostSettings, "account coordinator.setHostSettings");
  return {
    openExternal: async (url) => { await context.native.shell.openExternal(url); },
    getAccountRuntime: () => accountRuntimeOf(context),
    runtimeObservationOwner: "coordinator",
    emitAuthStatus: (status) => context.requireMainEdge().emit("cursor-auth-changed", status),
    sentryEnabled: context.env.SAND_DISABLE_SENTRY !== "1",
    settingsStore: context.settings.settingsStore,
    syncHostSettingsToBox: async (settings) => {
      const setHostSettings = context.coordinatorLegs.legs.setHostSettings;
      if (typeof setHostSettings !== "function") throw new Error("Electron production account requires coordinator host-settings synchronization.");
      await setHostSettings(settings);
    },
  };
}

function validateAuthService(service: AuthServicePort): AuthServicePort {
  requireObject(service, "accountOAuth.service");
  for (const method of ["subscribe", "getStatus", "getValidAccessToken", "revokeForAccountRefusal", "login", "cancelLogin", "logout", "updateDisplayName"] as const) {
    requireFunction(service[method], `accountOAuth.service.${method}`);
  }
  return service;
}

export function localDirectAuthStatus(context: ProductionServiceContext): SandAuthStatus | null {
  if (context.settings.settingsStore.getBoxRuntime() !== "local-docker") return null;
  const provider = context.settings.settingsStore.getInferenceProvider();
  if (provider !== "codex" && provider !== "claude-code") return null;
  if (!getLocalInferenceCliStatus()[provider].authenticated) return null;
  return {
    kind: "logged-in",
    authId: `local:${provider}`,
    displayName: provider === "codex" ? "Local Codex" : "Local Claude Code",
    isAnysphereUser: false,
    localProvider: provider,
  };
}

export function createLocalDirectAuthService(service: AuthServicePort, context: ProductionServiceContext): AuthServicePort {
  const project = async (status: SandAuthStatus): Promise<SandAuthStatus> => localDirectAuthStatus(context) ?? status;
  return {
    getStatus: async () => await project(await service.getStatus()),
    getValidAccessToken: (options) => service.getValidAccessToken(options),
    ...(service.peekAccessToken == null ? {} : { peekAccessToken: () => service.peekAccessToken!() }),
    revokeForAccountRefusal: async () => {
      const local = localDirectAuthStatus(context);
      if (local != null) return { kind: "completed" as const, status: local };
      return await service.revokeForAccountRefusal();
    },
    login: async () => await project(await service.login()),
    cancelLogin: async () => await project(await service.cancelLogin()),
    logout: async () => await project(await service.logout()),
    updateDisplayName: async (name) => localDirectAuthStatus(context) ?? await service.updateDisplayName(name),
    ...(service.devLogin == null ? {} : { devLogin: async (options: { readonly tier?: string; readonly email?: string }) => await project(await service.devLogin!(options)) }),
    subscribe(listener) {
      return service.subscribe((status) => { listener(localDirectAuthStatus(context) ?? status); });
    },
  };
}

/** Artifact anchor: main.cjs:505993, `var cursorAuthWiring = createCursorAuthWiring({`. */
export function createProductionAccountOAuthAdapter(
  ports: ProductionAccountOAuthPorts,
): ElectronProductionAdapterBindings["accountOAuth"] {
  return {
    async create(context): Promise<ProductionAccountService> {
      const wiring = createCursorAuthWiring((ports?.resolveWiringDeps ?? defaultWiringDeps)(context));
      const service = validateAuthService(createLocalDirectAuthService(await wiring.ensureCursorAuthService(), context));
      const subscriptions = new Set<() => void>();
      let disposed = false;
      return {
        getStatus: () => service.getStatus(),
        currentAuthStatusFreshness: wiring.currentAuthStatusFreshness,
        deliverCursorAuthStatus(status) {
          if (disposed) throw new Error("Electron production account adapter is disposed.");
          wiring.deliverCursorAuthStatus(service, status);
        },
        async getAuthService() {
          if (disposed) throw new Error("Electron production account adapter is disposed.");
          return service;
        },
        async revokeForAccountRefusal() {
          if (disposed) throw new Error("Electron production account adapter is disposed.");
          return await service.revokeForAccountRefusal();
        },
        subscribe(listener) {
          if (disposed) throw new Error("Electron production account adapter is disposed.");
          const unsubscribe = service.subscribe(() => listener());
          subscriptions.add(unsubscribe);
          return () => { if (subscriptions.delete(unsubscribe)) unsubscribe(); };
        },
        async dispose() {
          if (disposed) return;
          disposed = true;
          const failures: unknown[] = [];
          for (const unsubscribe of [...subscriptions].reverse()) {
            subscriptions.delete(unsubscribe);
            try { unsubscribe(); } catch (error) { failures.push(error); }
          }
          try { wiring.dispose(); } catch (error) { failures.push(error); }
          if (failures.length === 1) throw failures[0];
          if (failures.length > 1) throw new AggregateError(failures, "Electron production account cleanup failed.");
        },
      };
    },
  };
}

/**
 * Exact desktop account composition: native browser callback, secure-store
 * defaults, generated profile clients, main-edge status, coordinator account
 * runtime, and host-settings synchronization remain real owner seams.
 */
export function createElectronProductionAccountOAuthBinding(): ElectronProductionAdapterBindings["accountOAuth"] {
  return createProductionAccountOAuthAdapter({});
}
