import cors from "cors";
import express, { type ErrorRequestHandler, type Request } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { ZodError } from "zod";
import { randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import nodemailer from "nodemailer";
import type { ApiError, HealthResponse } from "@finsight/shared";
import { config, hasEmailProvider } from "./config.js";
import { prisma } from "./db.js";
import { decryptSecret, encryptSecret, hashPassword, hashRecovery, hashToken, randomToken, safeEqual, verifyPassword } from "./security.js";

const app = express();
const allowedOrigin = config.FRONTEND_ORIGIN;
const sessionCookie = "finsight_session";
const csrfCookie = "finsight_csrf";
const oauthStateCookie = "finsight_oauth_state";
const production = config.NODE_ENV === "production";
const cookieOptions = { httpOnly: true, secure: production, sameSite: "lax" as const, path: "/" };
const oauthClient = config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET ? new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET) : undefined;
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false, message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Please try again later." } } });

type UserRequest = Request & { user: { id: string; email: string; name: string; preferredLanguage: string; preferredCurrency: string; emailVerifiedAt: Date | null; twoFactorEnabled: boolean }; sessionId: string; csrfHash: string };
const userResponse = (user: UserRequest["user"]) => ({ id: user.id, email: user.email, name: user.name, preferredLanguage: user.preferredLanguage, preferredCurrency: user.preferredCurrency, emailVerifiedAt: user.emailVerifiedAt, twoFactorEnabled: user.twoFactorEnabled });
const asyncRoute = (handler: (request: Request, response: express.Response) => Promise<unknown>) => (request: Request, response: express.Response, next: express.NextFunction) => { void handler(request, response).catch(next); };

function getCookie(request: Request, name: string) {
  const raw = request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return raw ? decodeURIComponent(raw.slice(name.length + 1)) : undefined;
}

async function establishSession(userId: string, response: express.Response) {
  const token = randomToken();
  const csrf = randomToken();
  const session = await prisma.session.create({ data: { userId, tokenHash: hashToken(token), csrfHash: hashToken(csrf), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
  response.cookie(sessionCookie, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
  response.cookie(csrfCookie, csrf, { ...cookieOptions, httpOnly: false, maxAge: 30 * 24 * 60 * 60 * 1000 });
  return session;
}

async function sendEmail(to: string, subject: string, text: string, html: string) {
  if (!hasEmailProvider) return false;
  const transport = nodemailer.createTransport({ host: config.EMAIL_HOST, port: config.EMAIL_PORT, secure: config.EMAIL_PORT === 465, auth: { user: config.EMAIL_USER, pass: config.EMAIL_PASSWORD } });
  await transport.sendMail({ from: config.EMAIL_FROM, to, subject, text, html });
  return true;
}

const languages = z.enum(["en", "ml", "hi", "ta"]);
const credentials = z.object({ email: z.string().email().transform((value) => value.toLowerCase()), password: z.string().min(10).max(128) });
const passwordPair = z.object({ password: z.string().min(10).max(128), confirmPassword: z.string() }).refine((value) => value.password === value.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });
const requireAuth = (request: Request, response: express.Response, next: express.NextFunction) => {
  void (async () => {
    const token = getCookie(request, sessionCookie);
    if (!token) return response.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication is required." } });
    const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.deletedAt) return response.status(401).json({ error: { code: "UNAUTHORIZED", message: "Your session has expired." } });
    await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
    response.locals.user = session.user;
    response.locals.sessionId = session.id;
    response.locals.csrfHash = session.csrfHash;
    next();
  })().catch(next);
};
const currentUser = (response: express.Response) => response.locals.user as NonNullable<typeof response.locals.user>;
const requireCsrfToken = (request: Request, response: express.Response) => {
  const csrf = getCookie(request, csrfCookie);
  const header = request.get("x-csrf-token");
  const expected = response.locals.csrfHash as string | undefined;
  return Boolean(csrf && header && expected && safeEqual(csrf, header) && safeEqual(hashToken(csrf), expected));
};

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
if (production) app.set("trust proxy", 1);

const auth = express.Router();
auth.post("/register", authLimiter, asyncRoute(async (request, response) => {
  const body = z.object({ name: z.string().trim().min(2).max(80), email: z.string().email().transform((value) => value.toLowerCase()), password: z.string().min(10).max(128), confirmPassword: z.string(), termsAccepted: z.literal(true) }).refine((value) => value.password === value.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" }).parse(request.body);
  if (await prisma.user.findUnique({ where: { email: body.email } })) return response.status(409).json({ error: { code: "EMAIL_IN_USE", message: "An account with this email already exists." } });
  const user = await prisma.user.create({ data: { name: body.name, email: body.email, passwordHash: await hashPassword(body.password), preference: { create: {} } } });
  const rawToken = randomToken();
  await prisma.emailVerificationToken.create({ data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
  const link = `${config.FRONTEND_ORIGIN}/verify-email?token=${encodeURIComponent(rawToken)}`;
  const sent = await sendEmail(user.email, "Verify your FinSight AI email", `Verify your email: ${link}`, `<p>Verify your email: <a href="${link}">Continue</a></p>`);
  return response.status(201).json({ data: { user: userResponse(user as UserRequest["user"]), verificationEmailSent: sent, ...(sent ? {} : config.NODE_ENV === "development" ? { developmentEmailPreview: link } : {}) } });
}));
auth.post("/login", authLimiter, asyncRoute(async (request, response) => {
  const body = credentials.parse(request.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  const valid = user?.passwordHash ? await verifyPassword(user.passwordHash, body.password) : false;
  if (!user || !valid || user.deletedAt) return response.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });
  if (user.twoFactorEnabled) {
    const challenge = randomToken();
    await prisma.mfaLoginChallenge.create({ data: { userId: user.id, tokenHash: hashToken(challenge), expiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
    response.cookie("finsight_mfa", challenge, { ...cookieOptions, maxAge: 5 * 60 * 1000 });
    return response.json({ data: { requiresTwoFactor: true } });
  }
  await establishSession(user.id, response);
  await prisma.auditLog.create({ data: { userId: user.id, action: "auth.login", entityType: "Session" } });
  return response.json({ data: { user: userResponse(user as UserRequest["user"]) } });
}));
auth.post("/logout", requireAuth, asyncRoute(async (_request, response) => {
  if (!requireCsrfToken(_request, response)) return response.status(403).json({ error: { code: "CSRF_INVALID", message: "The security token is invalid." } });
  await prisma.session.update({ where: { id: response.locals.sessionId as string }, data: { revokedAt: new Date() } });
  response.clearCookie(sessionCookie, cookieOptions); response.clearCookie(csrfCookie, { ...cookieOptions, httpOnly: false });
  return response.json({ data: { loggedOut: true } });
}));
auth.post("/logout-all", requireAuth, asyncRoute(async (_request, response) => {
  if (!requireCsrfToken(_request, response)) return response.status(403).json({ error: { code: "CSRF_INVALID", message: "The security token is invalid." } });
  await prisma.session.updateMany({ where: { userId: currentUser(response).id, revokedAt: null }, data: { revokedAt: new Date() } });
  response.clearCookie(sessionCookie, cookieOptions); response.clearCookie(csrfCookie, { ...cookieOptions, httpOnly: false });
  return response.json({ data: { loggedOut: true } });
}));
auth.get("/me", requireAuth, (_request, response) => response.json({ data: { user: userResponse(currentUser(response) as UserRequest["user"]) } }));
auth.post("/verify-email", authLimiter, asyncRoute(async (request, response) => {
  const { token } = z.object({ token: z.string().min(20) }).parse(request.body);
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) return response.status(400).json({ error: { code: "TOKEN_INVALID", message: "This verification link is invalid or expired." } });
  await prisma.$transaction([prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }), prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })]);
  return response.json({ data: { verified: true } });
}));
auth.post("/forgot-password", authLimiter, asyncRoute(async (request, response) => {
  const { email } = z.object({ email: z.string().email().transform((value) => value.toLowerCase()) }).parse(request.body);
  const user = await prisma.user.findUnique({ where: { email } });
  let sent = false; let preview: string | undefined;
  if (user && !user.deletedAt) {
    const token = randomToken();
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
    const link = `${config.FRONTEND_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
    sent = await sendEmail(email, "Reset your FinSight AI password", `Reset your password: ${link}`, `<p>Reset your password: <a href="${link}">Continue</a></p>`);
    if (!sent && config.NODE_ENV === "development") preview = link;
  }
  return response.json({ data: { accepted: true, emailSent: sent, ...(preview ? { developmentEmailPreview: preview } : {}) } });
}));
auth.post("/reset-password", authLimiter, asyncRoute(async (request, response) => {
  const body = z.object({ token: z.string().min(20), ...passwordPair.shape }).parse(request.body);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(body.token) } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) return response.status(400).json({ error: { code: "TOKEN_INVALID", message: "This password reset link is invalid or expired." } });
  await prisma.$transaction([prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(body.password) } }), prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }), prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } })]);
  return response.json({ data: { reset: true } });
}));
auth.post("/2fa/setup", requireAuth, asyncRoute(async (_request, response) => {
  const user = currentUser(response);
  if (user.twoFactorEnabled) return response.status(409).json({ error: { code: "TWO_FACTOR_ENABLED", message: "Two-factor authentication is already enabled." } });
  const secret = authenticator.generateSecret();
  const encrypted = encryptSecret(secret);
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecretEncrypted: encrypted } });
  const otpAuthUrl = authenticator.keyuri(user.email, "FinSight AI", secret);
  return response.json({ data: { secret, qrCodeDataUrl: await QRCode.toDataURL(otpAuthUrl) } });
}));
auth.post("/2fa/verify", authLimiter, asyncRoute(async (request, response) => {
  const code = z.string().regex(/^\d{6}$/).parse(request.body.code);
  const challengeToken = getCookie(request, "finsight_mfa");
  if (challengeToken) {
    const challenge = await prisma.mfaLoginChallenge.findUnique({ where: { tokenHash: hashToken(challengeToken) }, include: { user: { include: { recoveryCodes: true } } } });
    if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date()) return response.status(401).json({ error: { code: "CHALLENGE_INVALID", message: "The sign-in challenge has expired." } });
    let valid = false;
    if (/^\d{6}$/.test(code) && challenge.user.twoFactorSecretEncrypted) valid = authenticator.verify({ token: code, secret: decryptSecret(challenge.user.twoFactorSecretEncrypted) });
    const recovery = typeof request.body.code === "string" ? challenge.user.recoveryCodes.find((item) => !item.usedAt && safeEqual(item.codeHash, hashRecovery(request.body.code))) : undefined;
    if (recovery) { valid = true; await prisma.twoFactorRecoveryCode.update({ where: { id: recovery.id }, data: { usedAt: new Date() } }); }
    if (!valid) return response.status(401).json({ error: { code: "CODE_INVALID", message: "The authenticator or recovery code is invalid." } });
    await prisma.mfaLoginChallenge.update({ where: { id: challenge.id }, data: { usedAt: new Date() } });
    response.clearCookie("finsight_mfa", cookieOptions);
    await establishSession(challenge.user.id, response);
    await prisma.auditLog.create({ data: { userId: challenge.user.id, action: "auth.login", entityType: "Session" } });
    return response.json({ data: { user: userResponse(challenge.user as UserRequest["user"]) } });
  }
  const user = currentUser(response);
  if (!user.twoFactorEnabled || !user.twoFactorSecretEncrypted) return response.status(400).json({ error: { code: "TWO_FACTOR_NOT_CONFIGURED", message: "Two-factor authentication is not configured." } });
  if (!authenticator.verify({ token: code, secret: decryptSecret(user.twoFactorSecretEncrypted) })) return response.status(400).json({ error: { code: "CODE_INVALID", message: "The authenticator code is invalid." } });
  const codes = Array.from({ length: 10 }, () => randomBytes(5).toString("hex").toUpperCase());
  await prisma.$transaction([prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } }), prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: user.id } }), ...codes.map((value) => prisma.twoFactorRecoveryCode.create({ data: { userId: user.id, codeHash: hashRecovery(value) } }))]);
  return response.json({ data: { enabled: true, recoveryCodes: codes } });
}));
auth.post("/2fa/disable", requireAuth, asyncRoute(async (request, response) => {
  if (!requireCsrfToken(request, response)) return response.status(403).json({ error: { code: "CSRF_INVALID", message: "The security token is invalid." } });
  const { password, code } = z.object({ password: z.string().min(1), code: z.string().min(6).max(32) }).parse(request.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: currentUser(response).id } });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, password))) return response.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Password is incorrect." } });
  const valid = user.twoFactorSecretEncrypted && authenticator.verify({ token: code, secret: decryptSecret(user.twoFactorSecretEncrypted) });
  if (!valid) return response.status(400).json({ error: { code: "CODE_INVALID", message: "The authenticator code is invalid." } });
  await prisma.$transaction([prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecretEncrypted: null } }), prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: user.id } })]);
  return response.json({ data: { enabled: false } });
}));
auth.get("/google", (_request, response) => {
  if (!oauthClient || !config.GOOGLE_CLIENT_ID) return response.status(503).json({ error: { code: "GOOGLE_NOT_CONFIGURED", message: "Google sign-in is not configured." } });
  const state = randomBytes(24).toString("base64url");
  response.cookie(oauthStateCookie, state, { ...cookieOptions, maxAge: 10 * 60 * 1000 });
  const redirectUri = `${config.FRONTEND_ORIGIN.replace(/:\d+$/, ":3001")}/api/v1/auth/google/callback`;
  return response.redirect(oauthClient.generateAuthUrl({ access_type: "online", scope: ["openid", "email", "profile"], state, redirect_uri: redirectUri, response_type: "code" }));
});
auth.get("/google/callback", asyncRoute(async (request, response) => {
  if (!oauthClient || !config.GOOGLE_CLIENT_ID || typeof request.query.code !== "string" || typeof request.query.state !== "string") return response.redirect(`${config.FRONTEND_ORIGIN}/login?error=google`);
  const expectedState = getCookie(request, oauthStateCookie);
  response.clearCookie(oauthStateCookie, cookieOptions);
  if (!expectedState || !safeEqual(expectedState, request.query.state)) return response.redirect(`${config.FRONTEND_ORIGIN}/login?error=google`);
  const redirectUri = `${config.FRONTEND_ORIGIN.replace(/:\d+$/, ":3001")}/api/v1/auth/google/callback`;
  const { tokens } = await oauthClient.getToken({ code: request.query.code, redirect_uri: redirectUri });
  const ticket = await oauthClient.verifyIdToken({ idToken: tokens.id_token ?? "", audience: config.GOOGLE_CLIENT_ID });
  const claims = ticket.getPayload();
  if (!claims?.sub || !claims.email || !claims.email_verified) return response.redirect(`${config.FRONTEND_ORIGIN}/login?error=google`);
  let oauth = await prisma.oAuthAccount.findUnique({ where: { provider_providerAccountId: { provider: "google", providerAccountId: claims.sub } }, include: { user: true } });
  if (!oauth) {
    const existing = await prisma.user.findUnique({ where: { email: claims.email.toLowerCase() } });
    if (existing) return response.redirect(`${config.FRONTEND_ORIGIN}/login?error=google_account_link`);
    const user = await prisma.user.create({ data: { email: claims.email.toLowerCase(), name: claims.name || claims.email, avatarUrl: claims.picture, emailVerifiedAt: new Date(), preference: { create: {} }, oauthAccounts: { create: { provider: "google", providerAccountId: claims.sub } } } });
    oauth = { user } as typeof oauth;
  }
  if (!oauth) return response.redirect(`${config.FRONTEND_ORIGIN}/login?error=google`);
  await establishSession(oauth.user.id, response);
  await prisma.auditLog.create({ data: { userId: oauth.user.id, action: "auth.google_login", entityType: "Session" } });
  return response.redirect(`${config.FRONTEND_ORIGIN}/`);
}));

app.use("/api/v1/auth", auth);
app.get("/api/v1/users/me", requireAuth, (_request, response) => response.json({ data: { user: userResponse(currentUser(response) as UserRequest["user"]) } }));
app.patch("/api/v1/users/me", requireAuth, asyncRoute(async (request, response) => {
  if (!requireCsrfToken(request, response)) return response.status(403).json({ error: { code: "CSRF_INVALID", message: "The security token is invalid." } });
  const data = z.object({ name: z.string().trim().min(2).max(80).optional(), preferredLanguage: languages.optional(), preferredCurrency: z.string().regex(/^[A-Z]{3}$/).optional() }).parse(request.body);
  const user = await prisma.user.update({ where: { id: currentUser(response).id }, data });
  return response.json({ data: { user: userResponse(user as UserRequest["user"]) } });
}));
app.get("/api/v1/users/preferences", requireAuth, asyncRoute(async (_request, response) => {
  const user = currentUser(response);
  const preferences = await prisma.userPreference.findUnique({ where: { userId: user.id } });
  return response.json({ data: { language: user.preferredLanguage, currency: user.preferredCurrency, dateFormat: preferences?.dateFormat ?? "dd/MM/yyyy", timezone: preferences?.timezone ?? "Asia/Kolkata", notificationPreferences: preferences?.notificationPreferences ?? {} } });
}));
app.patch("/api/v1/users/preferences", requireAuth, asyncRoute(async (request, response) => {
  if (!requireCsrfToken(request, response)) return response.status(403).json({ error: { code: "CSRF_INVALID", message: "The security token is invalid." } });
  const body = z.object({ language: languages.optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(), dateFormat: z.string().min(1).max(32).optional(), timezone: z.string().min(1).max(64).optional(), notificationPreferences: z.record(z.boolean()).optional() }).parse(request.body);
  const userId = currentUser(response).id;
  const user = await prisma.user.update({ where: { id: userId }, data: { ...(body.language ? { preferredLanguage: body.language } : {}), ...(body.currency ? { preferredCurrency: body.currency } : {}) } });
  const preferences = await prisma.userPreference.upsert({ where: { userId }, create: { userId, ...body }, update: body });
  return response.json({ data: { user: userResponse(user as UserRequest["user"]), preferences } });
}));

app.get("/api/v1/health", (_request, response) => {
  const health: HealthResponse = { status: "ok", service: "finsight-api" };
  response.status(200).json(health);
});
app.get("/api/v1/health/database", asyncRoute(async (_request, response) => {
  await prisma.$queryRaw`SELECT 1`;
  return response.json({ data: { status: "ok", database: "connected" } });
}));

app.use((_request, response) => {
  const error: ApiError = {
    error: { code: "NOT_FOUND", message: "The requested resource was not found." },
  };
  response.status(404).json(error);
});

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof ZodError) {
    const body: ApiError = {
      error: { code: "VALIDATION_ERROR", message: "The request did not pass validation." },
    };
    response.status(400).json(body);
    return;
  }

  if (error instanceof Error && (error.message.includes("Prisma") || "code" in error && typeof error.code === "string" && error.code.startsWith("P"))) {
    response.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "The database is unavailable. Please try again shortly." } });
    return;
  }

  console.error("Unhandled API error", error);
  const body: ApiError = {
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  };
  response.status(500).json(body);
};

app.use(errorHandler);

export { app };
