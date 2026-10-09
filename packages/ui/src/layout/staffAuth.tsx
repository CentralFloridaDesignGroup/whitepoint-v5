import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { QRCodeSVG } from "qrcode.react";
import { setCsrfToken } from "@whitepoint/utils";
import type { AppPermission } from "@whitepoint/types";
import {
  PASSWORD_CHARACTER_TYPES,
  PASSWORD_MINIMUM_TYPES,
  PASSWORD_MIN_LENGTH,
  validPassword,
} from "@whitepoint/types/constants";
import { Button, OTPInput, Textbox } from "../input";
import { KeyRound, UserKey } from "lucide-react";

const NUMBER_WORDS = ["zero", "one", "two", "three", "four"];

function PasswordRequirements({ password }: { password: string }) {
  const color = (met: boolean) => (met ? "text-green-600" : "text-gray-500"),
    typeCount = PASSWORD_CHARACTER_TYPES.filter((t) => t.test(password)).length;
  return (
    <div
      className="-mt-2 space-y-1 text-xs"
      aria-label="Password requirements"
    >
      <p className={color(password.length >= PASSWORD_MIN_LENGTH)}>
        At least {PASSWORD_MIN_LENGTH} characters long
      </p>
      <p className={color(typeCount >= PASSWORD_MINIMUM_TYPES)}>
        At least {NUMBER_WORDS[PASSWORD_MINIMUM_TYPES]} of the following
      </p>
      <ul className="space-y-1 pl-4">
        {PASSWORD_CHARACTER_TYPES.map((type) => (
          <li key={type.label} className={color(type.test(password))}>
            {type.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

type User = {
  id: string;
  email: string;
  displayName: string;
  roleName: string;
  permissions: string[];
};
type SessionResponse = {
  authenticated?: boolean;
  pendingMfa?: boolean;
  enrollmentRequired?: boolean;
  user?: User;
  csrfToken?: string;
};
type AuthResult = SessionResponse & {
  next?: "mfa" | "enroll";
  recoveryCodes?: string[];
  challenge?: string;
  secret?: string;
  uri?: string;
  error?: string;
};
type AuthState = {
  isLoaded: boolean;
  isAuthenticated: boolean;
  isConfigured: boolean;
  pendingMfa: boolean;
  enrollmentRequired: boolean;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  imageUrl: string | null;
  roleName: string | null;
  internalUserId: string | null;
  permissions: string[];
  hasPermission: (permission: AppPermission | string) => boolean;
  signOut: () => Promise<void>;
  refreshInternalUser: () => Promise<void>;
};
type AuthContextValue = AuthState & {
  apiBaseUrl: string;
  csrfToken: string;
  setResponse: (data: SessionResponse) => Promise<void>;
};
const empty: AuthContextValue = {
  isLoaded: false,
  isAuthenticated: false,
  isConfigured: true,
  pendingMfa: false,
  enrollmentRequired: false,
  userId: null,
  userName: null,
  userEmail: null,
  imageUrl: null,
  roleName: null,
  internalUserId: null,
  permissions: [],
  hasPermission: () => false,
  signOut: async () => {},
  refreshInternalUser: async () => {},
  apiBaseUrl: "",
  csrfToken: "",
  setResponse: async () => {},
};
const Context = createContext<AuthContextValue>(empty);

export function StaffAuthProvider({
  children,
  apiBaseUrl,
}: {
  children: ReactNode;
  apiBaseUrl: string;
}) {
  const [session, setSession] = useState<SessionResponse>({});
  const [loaded, setLoaded] = useState(false);
  const base = apiBaseUrl.replace(/\/$/, "");
  const refreshInternalUser = useCallback(async () => {
    try {
      const result = await fetch(`${base}/identity/session`, {
        credentials: "include",
      });
      const value = (await result.json()) as SessionResponse;
      setSession(value);
      setCsrfToken(value.csrfToken || "");
    } catch {
      setSession({});
      setCsrfToken("");
    } finally {
      setLoaded(true);
    }
  }, [base]);
  useEffect(() => {
    void refreshInternalUser();
  }, [refreshInternalUser]);
  const setResponse = useCallback(
    async (value: SessionResponse) => {
      setCsrfToken(value.csrfToken || "");
      await refreshInternalUser();
    },
    [refreshInternalUser],
  );
  const signOut = async () => {
    const result = await fetch(`${base}/identity/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": session.csrfToken || "" },
    });
    if (!result.ok) throw new Error("Sign-out could not be completed.");
    setSession({});
    setCsrfToken("");
  };
  const user = session.authenticated ? session.user : undefined;
  const permissions = user?.permissions || [];
  const value: AuthContextValue = {
    isLoaded: loaded,
    isAuthenticated: Boolean(session.authenticated),
    isConfigured: true,
    pendingMfa: Boolean(session.pendingMfa),
    enrollmentRequired: Boolean(session.enrollmentRequired),
    userId: user?.id || null,
    userName: user?.displayName || null,
    userEmail: user?.email || null,
    imageUrl: null,
    roleName: user?.roleName || null,
    internalUserId: user?.id || null,
    permissions,
    hasPermission: (permission) =>
      permissions.includes("*") || permissions.includes(permission),
    signOut,
    refreshInternalUser,
    apiBaseUrl: base,
    csrfToken: session.csrfToken || "",
    setResponse,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useStaffAuth(): AuthState {
  return useContext(Context);
}
export function StaffProtectedRoutes({
  permission,
  permissions,
}: {
  permission?: AppPermission;
  permissions?: AppPermission[];
}) {
  const auth = useStaffAuth(),
    location = useLocation();
  if (!auth.isLoaded)
    return <div className="p-6 text-center text-sm">Checking your access…</div>;
  if (!auth.isAuthenticated)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search + location.hash }}
      />
    );
  const allowed = permission
    ? auth.hasPermission(permission)
    : permissions
      ? permissions.some((key) => auth.hasPermission(key))
      : true;
  return allowed ? (
    <Outlet />
  ) : (
    <div className="rounded border border-red-300 bg-red-50 p-4 text-red-900">
      Your account does not have permission to open this page.
    </div>
  );
}
async function post(
  base: string,
  path: string,
  body: unknown,
  csrf = "",
): Promise<AuthResult> {
  const response = await fetch(`${base}/identity/${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: JSON.stringify(body),
  });
  const value = (await response.json().catch(() => ({}))) as AuthResult;
  if (!response.ok) throw new Error(String(value.error || "Request failed."));
  return value;
}
export function StaffLogin({
  title = "Sign in to White Point",
  logo = null,
}: {
  title?: string;
  logo?: React.ReactNode;
}) {
  const auth = useContext(Context),
    location = useLocation();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirmPassword, setConfirmPassword] = useState(""),
    [code, setCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [bootstrapToken, setBootstrapToken] = useState(""),
    [totpUri, setTotpUri] = useState(""),
    [totpSecret, setTotpSecret] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [passkeyAdded, setPasskeyAdded] = useState(false);
  const [step, setStep] = useState<
    "login" | "mfa" | "enroll" | "setup" | "reset" | "set-password"
  >(
    new URLSearchParams(location.search).has("token")
      ? "set-password"
      : "login",
  );

  const [csrf, setCsrf] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [setupRequired, setSetupRequired] = useState(false);
  const enrollmentAttempted = useRef(false);
  const isNewPassword = step === "setup" || step === "set-password";
  const pendingMfaDismissed = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${auth.apiBaseUrl}/identity/setup/status`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const result = (await response.json()) as { setupRequired?: boolean };
        setSetupRequired(result.setupRequired === true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [auth.apiBaseUrl]);

  useEffect(() => {
    if (!auth.pendingMfa) {
      pendingMfaDismissed.current = false;
      return;
    }
    if (
      auth.pendingMfa &&
      step === "login" &&
      !pendingMfaDismissed.current
    )
      setStep(auth.enrollmentRequired ? "enroll" : "mfa");
  }, [auth.pendingMfa, auth.enrollmentRequired, step]);
  
  const activeCsrf = csrf || auth.csrfToken;

  const execute = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const startAuthenticator = async (csrfToken = activeCsrf) => {
    const result = await post(auth.apiBaseUrl, "totp/start", {}, csrfToken);
    setTotpUri(result.uri || "");
    setTotpSecret(String(result.secret || ""));
    setCode("");
  };
  const accept = async (result: AuthResult) => {
    setCsrf(String(result.csrfToken || csrf));
    await auth.setResponse(result);
    if (result.next) setStep(result.next);
    else await auth.refreshInternalUser();
  };
  useEffect(() => {
    if (step !== "enroll") {
      enrollmentAttempted.current = false;
      return;
    }
    if (
      !auth.isLoaded ||
      !auth.pendingMfa ||
      !auth.enrollmentRequired ||
      !activeCsrf ||
      enrollmentAttempted.current
    )
      return;
    enrollmentAttempted.current = true;
    void execute(() => startAuthenticator());
  }, [
    step,
    auth.isLoaded,
    auth.pendingMfa,
    auth.enrollmentRequired,
    activeCsrf,
  ]);
  const signInWithPasskey = () =>
    void execute(async () => {
      const options = await post(auth.apiBaseUrl, "passkey/login/options", {
        email,
      });
      let assertion;
      try {
        assertion = await startAuthentication({
          optionsJSON: options as unknown as Parameters<
            typeof startAuthentication
          >[0]["optionsJSON"],
        });
      } catch (cause) {
        if (
          !email &&
          cause instanceof Error &&
          cause.name === "NotAllowedError"
        )
          throw new Error(
            "No passkey was selected. If yours is not listed, enter your email and try again.",
          );
        throw cause;
      }
      await accept(
        await post(auth.apiBaseUrl, "passkey/login/verify", {
          email,
          challenge: options.challenge,
          response: assertion,
        }),
      );
    });
  if (auth.isLoaded && auth.isAuthenticated && codes.length === 0) {
    const from = (location.state as { from?: string } | null)?.from || "";
    const isSafeDestination =
      from.startsWith("/") &&
      !from.startsWith("//") &&
      !from.startsWith("/login") &&
      new URL(from, window.location.origin).pathname !== "/";
    return <Navigate to={isSafeDestination ? from : "/dashboard"} replace />;
  }
  return (
    <div
      className="flex min-h-dvh w-full"
      style={{
        background:
          "linear-gradient(135deg, #e8f2f7 0%, #add2e2 35%, #6ca6c6 68%, #285f82 100%)",
      }}
    >
      {/* Main form area */}
      <div className="block w-full md:flex flex-1 items-center justify-center">
        <main className="mx-auto bg-white px-5 py-8 md:w-[400px] md:max-w-[400px] md:shrink-0 md:px-4 border-l-5 border-[#1c3d5a]">
        <h1 className="text-xl font-semibold leading-tight text-slate-900">
          {logo || title}
        </h1>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="mt-4 rounded bg-green-50 p-3 text-sm text-green-800"
          >
            {notice}
          </p>
        )}
        {codes.length > 0 ? (
          <section className="mt-5">
            <h2 className="font-semibold">Save your recovery codes</h2>
            <p className="text-sm">
              Your authenticator is ready. Each recovery code works once. Store
              these codes somewhere safe before continuing.
            </p>
            <ul className="my-4 grid grid-cols-1 gap-2 font-mono text-sm sm:grid-cols-2 md:grid-cols-1">
              {codes.map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <button
                disabled={busy}
                className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
                onClick={() => {
                  setCodes([]);
                  void auth.refreshInternalUser();
                }}
              >
                I saved these codes
              </button>
              <button
                disabled={busy || passkeyAdded}
                className="rounded border border-slate-300 px-4 py-2 disabled:opacity-50"
                onClick={() =>
                  void execute(async () => {
                    const options = await post(
                      auth.apiBaseUrl,
                      "passkey/register/options",
                      {},
                      activeCsrf,
                    );
                    const credential = await startRegistration({
                      optionsJSON: options as unknown as Parameters<
                        typeof startRegistration
                      >[0]["optionsJSON"],
                    });
                    await post(
                      auth.apiBaseUrl,
                      "passkey/register/verify",
                      { challenge: options.challenge, response: credential },
                      activeCsrf,
                    );
                    setPasskeyAdded(true);
                    setNotice(
                      "Passkey added. Save your recovery codes before continuing.",
                    );
                  })
                }
              >
                {passkeyAdded ? "Passkey added" : "Add a passkey (optional)"}
              </button>
            </div>
          </section>
        ) : (
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (isNewPassword) {
                if (!validPassword(password)) {
                  setError("Password does not meet the requirements.");
                  return;
                }
                if (password !== confirmPassword) {
                  setError("Passwords do not match.");
                  return;
                }
              }
              void execute(async () => {
                if (step === "login")
                  await accept(
                    await post(auth.apiBaseUrl, "login", { email, password }),
                  );
                if (step === "mfa") {
                  await post(
                    auth.apiBaseUrl,
                    "mfa",
                    { code },
                    csrf ||
                      (
                        await (
                          await fetch(`${auth.apiBaseUrl}/identity/session`, {
                            credentials: "include",
                          })
                        ).json()
                      ).csrfToken,
                  );
                  await auth.refreshInternalUser();
                }
                if (step === "enroll") {
                  const result = await post(
                    auth.apiBaseUrl,
                    "totp/confirm",
                    { code },
                    activeCsrf,
                  );
                  setCodes(result.recoveryCodes || []);
                  setTotpUri("");
                  setTotpSecret("");
                  await auth.refreshInternalUser();
                }
                if (step === "setup") {
                  const result = await post(auth.apiBaseUrl, "setup", {
                    bootstrapToken,
                    password,
                  });
                  setSetupRequired(false);
                  await accept(result);
                }
                if (step === "reset") {
                  await post(auth.apiBaseUrl, "password/reset", { email });
                  setNotice(
                    "If the account exists, a reset link has been sent.",
                  );
                  setStep("login");
                }
                if (step === "set-password") {
                  await accept(
                    await post(auth.apiBaseUrl, "password/set", {
                      token: new URLSearchParams(location.search).get("token"),
                      password,
                    }),
                  );
                  window.history.replaceState({}, "", "/login");
                }
              });
            }}
          >
            {["login", "reset"].includes(step) && (
              <Textbox
                field="Email"
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
            {["login", "setup", "set-password"].includes(step) && (
              <Textbox
                field="Password"
                required
                type="password"
                autoComplete={
                  step === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
            {isNewPassword && <PasswordRequirements password={password} />}
            {isNewPassword && (
              <Textbox
                field="Confirm password"
                required
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            )}
            {step === "setup" && (
              <Textbox
                field="Administrator setup token"
                required
                type="password"
                value={bootstrapToken}
                onChange={(e) => setBootstrapToken(e.target.value)}
              />
            )}
            {step === "mfa" && (
              <div className="space-y-2">
                {useRecoveryCode ? (
                  <Textbox
                    field="Recovery code"
                    label="Recovery code"
                    required
                    autoComplete="off"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                ) : (
                  <OTPInput
                    value={code}
                    onChange={setCode}
                    label="Authenticator code"
                  />
                )}
                <button
                  type="button"
                  className="text-sm font-medium text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                  onClick={() => {
                    setCode("");
                    setUseRecoveryCode((current) => !current);
                  }}
                >
                  {useRecoveryCode
                    ? "Use authenticator code"
                    : "Use a recovery code"}
                </button>
              </div>
            )}
            {step === "enroll" && (
              <p className="text-sm text-slate-600">
                Scan the QR code or enter the setup key in your authenticator
                app. Then enter its six-digit code to finish setup.
              </p>
            )}
            {step === "enroll" && totpUri && totpSecret && (
              <div className="rounded bg-slate-50 p-3 text-sm">
                <p>Scan this QR code with your authenticator app:</p>
                <div
                  role="img"
                  aria-label="Authenticator setup QR code"
                  className="my-3 flex justify-center rounded bg-white p-3"
                >
                  <QRCodeSVG
                    value={totpUri}
                    size={208}
                    level="M"
                    marginSize={4}
                    className="h-auto max-w-full"
                  />
                </div>
                <p>Or enter this setup key manually:</p>
                <p className="mt-2 break-all font-mono font-semibold">
                  {totpSecret}
                </p>
              </div>
            )}
            {step === "enroll" && totpUri && totpSecret && (
              <OTPInput
                value={code}
                onChange={setCode}
                label="Authenticator code"
              />
            )}
            {(step !== "enroll" || (totpUri && totpSecret)) && (
              <Button
                type="submit"
                disabled={busy}
                className="w-full rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
              >
                {busy
                  ? "Working…"
                  : step === "login"
                    ? "Sign in"
                    : step === "mfa"
                      ? "Verify"
                      : step === "enroll"
                        ? "Enable authenticator"
                        : step === "reset"
                          ? "Send reset link"
                          : step === "setup"
                            ? "Set up administrator"
                            : "Set password"}
              </Button>
            )}
          </form>
        )}
        {codes.length === 0 && (
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-blue-700">
            {step === "login" && (
              <>
                <hr className="my-4 w-full border-gray-500" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full">
                  <Button onClick={signInWithPasskey} variant="secondary">
                    <KeyRound
                      className="w-4 h-4 rotate-45"
                      aria-hidden="true"
                    />
                    Use Passkey
                  </Button>
                  <Button onClick={() => setStep("reset")} variant="secondary">
                    <UserKey className="w-4 h-4" aria-hidden="true" />
                    Reset password
                  </Button>
                </div>
                {setupRequired && (
                  <div className="md:col-span-2 w-full">
                    <Button
                      onClick={() => setStep("setup")}
                      variant="secondary"
                    >
                      First administrator setup
                    </Button>
                  </div>
                )}
              </>
            )}
            {step === "enroll" && !totpUri && !error && (
              <span role="status" className="text-slate-600">
                Preparing authenticator setup…
              </span>
            )}
            {step === "enroll" && !totpUri && error && (
              <button
                disabled={busy}
                onClick={() => void execute(() => startAuthenticator())}
              >
                Retry authenticator setup
              </button>
            )}
            {step !== "login" && (
              <div className="md:col-span-2 w-full">
              <Button
                onClick={() => {
                  pendingMfaDismissed.current = true;
                  setStep("login");
                }}
                variant="secondary"
              >
                Back to sign in
              </Button>
              </div>
            )}
          </div>
        )}
      </main>
      </div>
    </div>
  );
}
