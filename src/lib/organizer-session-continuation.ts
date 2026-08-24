export function shouldRedirectUnauthenticatedOrganizer(input: {
  authenticated: boolean | undefined;
  warningOpen: boolean;
  sessionEnding: boolean;
}): boolean {
  return input.authenticated === false && !input.warningOpen && !input.sessionEnding;
}
