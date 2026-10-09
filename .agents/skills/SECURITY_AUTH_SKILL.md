# Security Auth Skill

Authentication and authorization patterns for secure applications.

## Quick Reference

### Authentication Methods

| Method | Use Case | Security Level |
|--------|----------|----------------|
| JWT + Refresh | SPAs, Mobile apps | High |
| Session cookies | Traditional web apps | High |
| OAuth2/OIDC | Social login, SSO | High |
| API Keys | Service-to-service | Medium |
| MFA | High-security apps | Very High |

### Authorization Patterns

| Pattern | Use Case | Complexity |
|---------|----------|------------|
| RBAC | Most applications | Low-Medium |
| ABAC | Fine-grained control | High |
| ReBAC | Relationship-based | Medium |
| Permission Matrix | Admin panels | Low |

## JWT Token Service

```typescript
export class TokenService {
  private readonly accessExpiry = '15m';   // Short-lived
  private readonly refreshExpiry = '7d';   // Rotate on use

  generateTokenPair(user: User): TokenPair {
    const accessToken = jwt.sign(
      { sub: user.id, type: 'access' },
      this.accessSecret,
      { expiresIn: this.accessExpiry }
    );

    const refreshToken = jwt.sign(
      { sub: user.id, type: 'refresh' },
      this.refreshSecret,
      { expiresIn: this.refreshExpiry }
    );

    return { accessToken, refreshToken };
  }
}
```

## Password Hashing

```typescript
import bcrypt from 'bcrypt';

// Hash password (cost factor 12)
const hash = await bcrypt.hash(password, 12);

// Verify password
const isValid = await bcrypt.verify(password, hash);
```

## RBAC Guard (NestJS)

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
      ROLES_KEY, [context.getHandler(), context.getClass()]
    );
    if (!requiredRoles) return true;
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some(role => user.roles?.includes(role));
  }
}
```

## OAuth2/OIDC Flow

```typescript
// Passport OAuth2 Strategy
passport.use(new OAuth2Strategy({
  authorizationURL: 'https://provider.com/oauth2/authorize',
  tokenURL: 'https://provider.com/oauth2/token',
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: '/auth/callback',
}, (accessToken, refreshToken, profile, done) => {
  return done(null, profile);
}));
```

## Anti-Patterns

```typescript
// Storing passwords in plain text
user.password = plainPassword; // NEVER DO THIS

// Missing rate limiting on auth
app.post('/login', loginHandler); // ADD RATE LIMITING

// Long-lived access tokens
{ expiresIn: '30d' } // TOO LONG - use 15m max
```

## F5 Quality Gates

| Gate | Requirement |
|------|-------------|
| G2 | Auth requirements documented |
| G2.5 | Auth controls implemented |
| G3 | Auth tests passing (90%+ coverage) |
