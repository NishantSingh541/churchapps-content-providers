import { IProvider } from "../interfaces";

export const providerRegistry: Map<string, IProvider> = new Map();

export function getProvider(providerId: string): IProvider | null {
  return providerRegistry.get(providerId) || null;
}

export function getAllProviders(): IProvider[] {
  return Array.from(providerRegistry.values());
}

export function registerProvider(provider: IProvider): void {
  providerRegistry.set(provider.id, provider);
}

const providerSecrets: Map<string, string> = new Map();

/**
 * Store a client secret for a given provider ID (e.g. for OAuth-based providers
 * that need a secret injected at runtime rather than hardcoded).
 */
export function setProviderSecret(providerId: string, secret: string): void {
  providerSecrets.set(providerId, secret);
}

/**
 * Retrieve a previously-stored client secret for a given provider ID.
 * Returns null if none was set.
 */
export function getProviderSecret(providerId: string): string | null {
  return providerSecrets.get(providerId) || null;
}
