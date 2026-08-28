export { BUILTIN_AGENT_PROFILES, commandAvailable, discoverAgentProfiles, loadAgentProfiles, resolveCommandPath } from './agents';
export { AcpManager, type AcpManagerCallbacks, type AcpMcpServer } from './acp';
export { CheckpointManager, sha256 } from './checkpoints';
export { StudioEngine, type StudioEngineOptions } from './engine';
export {
  defaultDocumentsRoot,
  documentTitle,
  forgetDocument,
  isDocumentRoot,
  discoverDocuments,
  listPresentations,
  readLibrary,
  rememberDocument,
  reserveDocumentPath,
  studioDataRoot,
  type LibraryEntry,
} from './library';
export { connectStudio, type StudioClientOptions } from './remote';
export { canonicalProjectRoot, resolveProjectPath, assertLoopbackUrl, isAllowedBrowserOrigin } from './security';
export { scaffoldStudioDocument, scaffoldStudioProject, type ScaffoldStudioOptions } from './scaffold';
export { SLIDE_TEMPLATES, listSlideTemplates, resolveSlideTemplate, type SlideTemplateRecipe } from './templates';
export { startStudio, type StartStudioOptions, type StudioServer } from './server';
export {
  STUDIO_PROTOCOL_VERSION,
  normalizeSelection,
  type AgentAvailability,
  type AgentLifecycle,
  type AgentProfile,
  type AgentState,
  type AgentTranscriptItem,
  type AuthoringMessage,
  type CaptureResult,
  type DeckSource,
  type DeleteSlideResult,
  type DiscoveredAgentProfile,
  type EditResult,
  type GuardedEdit,
  type InsertSlideResult,
  type LogicalBounds,
  type NavigationMessage,
  type PromptResult,
  type SaveResult,
  type SemanticSelection,
  type SelectedTextEditResult,
  type SlideOutlineItem,
  type StudioOperations,
  type StudioState,
  type TextEditMessage,
  type UndoResult,
  type ValidationLifecycle,
} from './types';
