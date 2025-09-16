---
title: "{title}"
status: "{status}"
created: "{created}"
url: "{url}"
opened_by: "{author}"
assignees: {assignees_yaml}
labels: {labels_yaml}
milestone: "{milestone}"
comments: {commentsCount}
locked: {isLocked}
merged: {merged}
mergeable: {mergeable}
base_branch: "{baseBranch}"
head_branch: "{headBranch}"
updateMode: "none"
allowDelete: true
---

# {title}

**Pull Request #{number}** opened by **{author}** on {created}

{body}

## Pull Request Details

- **Status:** {status}
- **Repository:** {repository}
- **Base Branch:** `{baseBranch}`
- **Head Branch:** `{headBranch}`
- **Merged:** {merged}
- **Mergeable:** {mergeable}
{mergedAt:- **Merged At:** {mergedAt}}

## Metadata

- **Assignees:** {assignees}
- **Labels:** {labels}
- **Comments:** {commentsCount}
- **Created:** {created}
- **Updated:** {updated}
{closed:- **Closed:** {closed}}
{milestone:- **Milestone:** {milestone}}

{labels_hash}

---

**[View on GitHub]({url})**
