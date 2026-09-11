export function shouldShowAuthenticatedAppHeader(input: {
  authenticated: boolean;
  isLoginRoute: boolean;
  isStandaloneRoute: boolean;
}): boolean {
  return input.authenticated && !input.isLoginRoute && !input.isStandaloneRoute;
}
