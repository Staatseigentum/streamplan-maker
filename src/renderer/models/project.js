import { APP_VERSION, SCHEMA_VERSION } from "../../shared/constants.js";
import { createStreamerProfile, profileFromDict, profileToDict } from "./schedule.js";
import { createStyleConfig, styleFromDict, styleToDict } from "./style.js";

export function createProjectDocument({ profile = createStreamerProfile(), style = createStyleConfig() } = {}) {
  const now = new Date().toISOString();
  return {
    profile,
    style,
    appVersion: APP_VERSION,
    createdAt: now,
    modifiedAt: now,
  };
}

export function touch(doc) {
  doc.modifiedAt = new Date().toISOString();
}

export function projectToDict(doc) {
  return {
    schema_version: SCHEMA_VERSION,
    app_version: doc.appVersion,
    created_at: doc.createdAt,
    modified_at: doc.modifiedAt,
    profile: profileToDict(doc.profile),
    style: styleToDict(doc.style),
  };
}

export function projectFromDict(data) {
  return {
    profile: profileFromDict(data.profile || {}),
    style: styleFromDict(data.style || {}),
    appVersion: data.app_version || APP_VERSION,
    createdAt: data.created_at || new Date().toISOString(),
    modifiedAt: data.modified_at || new Date().toISOString(),
  };
}
