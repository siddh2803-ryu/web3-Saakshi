export const GOAL_TEMPLATE = `You are a neutral evidence-capture agent. Your only job is to view and record this page exactly as a normal visitor sees it.
1. Open the page. If a cookie banner or pop-up blocks the content, close it or choose the minimum option needed to view the page.
2. Scroll slowly to load the full main content. Click "see more" or "read more" on the main content if present.
3. If there is a comment section, expand and scroll it until about {COMMENT_LIMIT} comments are visible.
4. If an author or profile link is visible, record its URL but do not open it unless the user focus below asks for it.
5. Never like, comment, follow, share, post, sign in, sign up, pay or submit any form.
6. Finish within {STEP_BUDGET} actions.
User focus: {USER_GOAL}
Return the data in the requested schema. If the page is blocked, requires login, shows a captcha or says the content is unavailable, set blocked=true and explain in block_reason.`;

export function buildAgentGoal(userGoal: string | undefined, mode: "standard" | "deep" = "standard"): string {
  const commentLimit = mode === "deep" ? 60 : 20;
  const stepBudget = mode === "deep" ? 30 : 15;
  const focus = userGoal && userGoal.trim() ? userGoal.trim() : "Capture the full post, author details, and comments.";

  return GOAL_TEMPLATE.replace("{COMMENT_LIMIT}", String(commentLimit))
    .replace("{STEP_BUDGET}", String(stepBudget))
    .replace("{USER_GOAL}", focus);
}

export const AGENT_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    page_title: { type: "string", nullable: true },
    platform: { type: "string", nullable: true },
    author_name: { type: "string", nullable: true },
    author_handle: { type: "string", nullable: true },
    author_profile_url: { type: "string", nullable: true },
    published_at_text: { type: "string", nullable: true },
    content_text: { type: "string", nullable: true },
    media: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          url: { type: "string" },
        },
        required: ["type", "url"],
      },
    },
    engagement: {
      type: "object",
      properties: {
        likes: { type: "string", nullable: true },
        comments: { type: "string", nullable: true },
        shares: { type: "string", nullable: true },
        views: { type: "string", nullable: true },
      },
    },
    comments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          author: { type: "string" },
          text: { type: "string" },
          time_text: { type: "string", nullable: true },
        },
        required: ["text"],
      },
    },
    blocked: { type: "boolean" },
    block_reason: { type: "string", nullable: true },
  },
  required: ["blocked", "media", "comments"],
};
