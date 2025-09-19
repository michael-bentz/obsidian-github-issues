/**
 * Utility function for escaping content in different modes
 * @param unsafe The string to escape
 * @param mode The escaping mode: "disabled", "normal", "strict", or "veryStrict"
 * @returns The escaped string
 * @throws Error if input is null or undefined
 *
 * Modes:
 * - disabled: No escaping applied
 * - normal: Basic escaping for Templater and Dataview compatibility
 * - strict: Remove potentially dangerous HTML/JS characters (preserves Unicode)
 * - veryStrict: Remove more special characters (preserves Unicode but more restrictive)
 */
export function escapeBody(
	unsafe: string,
	mode: "disabled" | "normal" | "strict" | "veryStrict" = "normal",
): string {
	if (unsafe === null || unsafe === undefined) {
		throw new Error("Input cannot be null or undefined");
	}

	if (mode === "disabled") {
		return unsafe;
	}

	if (mode === "strict") {
		// Allow Unicode characters, whitespace, common punctuation, and URL/Markdown specific characters
		// Remove potentially dangerous characters while preserving Chinese and other Unicode characters
		return unsafe
			.replace(/[<>{}$`\\]/g, "")  // Remove potentially dangerous HTML/JS/template characters
			.replace(/---/g, "- - -");  // Escape YAML frontmatter separators
	}

	if (mode === "veryStrict") {
		// Allow Unicode characters, whitespace, basic punctuation, and essential URL/Markdown characters
		// More restrictive than strict mode but still preserves Chinese and other Unicode characters
		return unsafe
			.replace(/[<>{}$`\\"'|&*~^]/g, "")  // Remove more potentially dangerous characters
			.replace(/---/g, "- - -");  // Escape YAML frontmatter separators
	}

	// normal mode
	return unsafe
		.replace(/<%/g, "'<<'")
		.replace(/%>/g, "'>>'")
		.replace(/`/g, '"')
		.replace(/---/g, "- - -")
		.replace(/{{/g, "((")
		.replace(/}}/g, "))");
}
