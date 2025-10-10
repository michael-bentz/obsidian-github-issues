---
title: "{title_yaml}"
number: {number}
status: "{status}"
created: "{created}"
url: "{url}"
opened_by: "{author}"
assignees: {assignees_yaml}
labels: {labels_yaml}
milestone: "{milestone}"
comments: {commentsCount}
locked: {isLocked}
updateMode: "none"
allowDelete: true
---

# {title}

**Issue #{number}** opened by **{author}** on {created}

{body}

## Metadata

- **Status:** {status}
- **Repository:** {repository}
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
