import type {
  AuthorIdentity,
  BitbucketActivityItem,
  BitbucketUserRef,
  NormalizedActivity,
} from "./types.js";

const BOT_SUBSTRINGS = [
  "jenkins",
  "sonar",
  "pipeline",
  "bitbucket-bot",
  "dependabot",
  "renovate",
  "[bot]",
] as const;

export function extractAuthorIdentity(user?: BitbucketUserRef | null): AuthorIdentity {
  if (!user) return {};
  return {
    uuid: user.uuid,
    accountId: user.account_id,
  };
}

function actorLabels(user?: BitbucketUserRef | null): {
  nickname?: string;
  username?: string;
  displayName?: string;
} {
  if (!user) return {};
  return {
    nickname: user.nickname,
    username: user.username,
    displayName: user.display_name,
  };
}

export function isBotActor(user?: BitbucketUserRef | null): boolean {
  if (!user) return false;
  const haystack = [user.nickname, user.username, user.display_name, user.type]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return BOT_SUBSTRINGS.some((s) => haystack.includes(s));
}

export function isSameAuthor(
  actor: AuthorIdentity,
  author: AuthorIdentity,
): boolean {
  if (actor.uuid && author.uuid && actor.uuid === author.uuid) return true;
  if (actor.accountId && author.accountId && actor.accountId === author.accountId) {
    return true;
  }
  return false;
}

export function normalizeActivity(item: BitbucketActivityItem): NormalizedActivity | null {
  if (item.comment && !item.comment.deleted) {
    return {
      kind: "comment",
      at: new Date(item.comment.created_on),
      actor: {
        ...extractAuthorIdentity(item.comment.user),
        ...actorLabels(item.comment.user),
      },
    };
  }
  if (item.approval) {
    return {
      kind: "approval",
      at: new Date(item.approval.date),
      actor: {
        ...extractAuthorIdentity(item.approval.user),
        ...actorLabels(item.approval.user),
      },
    };
  }
  if (item.changes_requested) {
    return {
      kind: "changes_requested",
      at: new Date(item.changes_requested.date),
      actor: {
        ...extractAuthorIdentity(item.changes_requested.user),
        ...actorLabels(item.changes_requested.user),
      },
    };
  }
  if (item.update) {
    return {
      kind: "update",
      at: new Date(item.update.date),
      actor: {
        ...extractAuthorIdentity(item.update.author),
        ...actorLabels(item.update.author),
      },
    };
  }
  return null;
}

/**
 * Meaningful human review: comment, approval, or changes_requested
 * from someone who is not the PR author and not a known bot.
 * Branch/description updates are never meaningful reviews.
 */
export function isMeaningfulReview(
  activity: NormalizedActivity,
  prAuthor: AuthorIdentity,
): boolean {
  if (activity.kind === "update" || activity.kind === "unknown") return false;
  if (activity.kind !== "comment" && activity.kind !== "approval" && activity.kind !== "changes_requested") {
    return false;
  }
  if (isSameAuthor(activity.actor, prAuthor)) return false;

  const pseudoUser: BitbucketUserRef = {
    nickname: activity.actor.nickname,
    username: activity.actor.username,
    display_name: activity.actor.displayName,
  };
  if (isBotActor(pseudoUser)) return false;

  return true;
}

export function isApprovalActivity(
  activity: NormalizedActivity,
  prAuthor: AuthorIdentity,
): boolean {
  if (activity.kind !== "approval") return false;
  if (isSameAuthor(activity.actor, prAuthor)) return false;
  const pseudoUser: BitbucketUserRef = {
    nickname: activity.actor.nickname,
    username: activity.actor.username,
    display_name: activity.actor.displayName,
  };
  if (isBotActor(pseudoUser)) return false;
  return true;
}
