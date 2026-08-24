/**
 * Integration types for external providers
 */

// Integration Provider as string union type
export type IntegrationProviderType = "smartsheet" | "jira" | "asana" | "github" | "clickup" | "google_docs" | "monday" | "linear";

// Integration Provider as enum (for switch statements)
export enum IntegrationProvider {
  Smartsheet = "smartsheet",
  Jira = "jira",
  Asana = "asana",
  GoogleDocs = "google_docs",
  Monday = "monday",
  GitHub = "github",
  Clickup = "clickup",
  Linear = "linear"
}

// Export default as the enum for backward compatibility
export default IntegrationProvider;