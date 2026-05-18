const {
  PROFILES_KEY,
  ACTIVE_PROFILE_KEY
} = require('../constants');
const {
  getDefaultProfiles,
  profileNeedsApiKey,
  getSecretId,
  nowIso
} = require('../utils');

class ProfileStore {
  constructor(context) {
    this.context = context;
  }

  async getProfiles() {
    const existing = this.context.globalState.get(PROFILES_KEY);
    if (Array.isArray(existing) && existing.length > 0) {
      return existing;
    }

    const profiles = getDefaultProfiles();
    await this.context.globalState.update(PROFILES_KEY, profiles);
    await this.context.globalState.update(ACTIVE_PROFILE_KEY, profiles[0].id);
    return profiles;
  }

  async saveProfiles(profiles) {
    await this.context.globalState.update(PROFILES_KEY, profiles);
  }

  async getActiveProfileId() {
    const profiles = await this.getProfiles();
    const activeId = this.context.globalState.get(ACTIVE_PROFILE_KEY);
    return profiles.some((profile) => profile.id === activeId) ? activeId : profiles[0]?.id;
  }

  async setActiveProfileId(profileId) {
    const profiles = await this.getProfiles();
    if (!profiles.some((profile) => profile.id === profileId)) {
      return;
    }

    await this.context.globalState.update(ACTIVE_PROFILE_KEY, profileId);
  }

  async getActiveProfile() {
    const profiles = await this.getProfiles();
    const activeId = await this.getActiveProfileId();
    return profiles.find((profile) => profile.id === activeId) || profiles[0];
  }

  async getSecret(profile) {
    if (!profile?.apiKeySecretId) {
      return '';
    }

    return await this.context.secrets.get(profile.apiKeySecretId) || '';
  }

  async serializeProfiles() {
    const profiles = await this.getProfiles();
    const result = [];

    for (const profile of profiles) {
      result.push({
        ...profile,
        needsApiKey: profileNeedsApiKey(profile),
        hasApiKey: Boolean(await this.getSecret(profile))
      });
    }

    return result;
  }

  async upsertProfile(profile) {
    const profiles = await this.getProfiles();
    const index = profiles.findIndex((item) => item.id === profile.id);

    if (index === -1) {
      profiles.push(profile);
    } else {
      profiles[index] = profile;
    }

    await this.saveProfiles(profiles);
    return profile;
  }

  async deleteProfile(profileId) {
    const profiles = await this.getProfiles();
    if (profiles.length <= 1) {
      throw new Error('A extensao precisa de pelo menos um perfil.');
    }

    const nextProfiles = profiles.filter((profile) => profile.id !== profileId);
    await this.saveProfiles(nextProfiles);

    const activeId = await this.getActiveProfileId();
    if (activeId === profileId) {
      await this.setActiveProfileId(nextProfiles[0].id);
    }
  }

  async setApiKey(profile, apiKey) {
    const secretId = profile.apiKeySecretId || getSecretId(profile.id);
    await this.context.secrets.store(secretId, apiKey);
    await this.upsertProfile({
      ...profile,
      apiKeySecretId: secretId,
      updatedAt: nowIso()
    });
  }
}

module.exports = {
  ProfileStore
};
