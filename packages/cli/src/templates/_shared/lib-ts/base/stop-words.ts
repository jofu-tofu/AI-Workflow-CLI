/**
 * Stop words for context ID generation.
 *
 * Generated from analysis of 1,424 prompts, context summaries, and plan files.
 * Words that appear frequently but don't help identify the specific task.
 *
 * ACTION VERBS ARE INTENTIONALLY EXCLUDED:
 * add, fix, update, create, implement, refactor, migrate, debug, remove, change,
 * move, rename, delete, build, test, deploy, verify, analyze, modify, write, run,
 * check, replace, save, sync, load, extract, install, clean, merge, etc.
 *
 * See SPEC.md §14.1
 */

export const STOP_WORDS: ReadonlySet<string> = new Set([
  // ARTICLES
  "a", "about", "above",

  "absolutely", "accordingly", "across", "active", "actually", "after", "afterwards", "against", "ago", "ah",
  "aiw", "all", "allow", "almost", "along", "already", "alright", "also",
  "alternatively", "although", "always", // AUXILIARY/MODAL VERBS
  "am", "among", "an", // CONJUNCTIONS
  "and", "another",
  "any", "anybody", "anyone", "anything", "anyway", "anyways", "apparently", "appear",
  "are", "aren", "arent", "args", "around", "as", "ask",
  "assert", "async", "at", // SINGLE LETTERS
  "b",

  "based", "basic", "basically", "bat", "be", "because", "become",
  "been", "before", "begin", "behind", "being",
  "below", "below", "beside", "besides", "between", "beyond", "block",

  "both", "but", "by", "c", "can", "cant", "case",
  "cases", "cause", "cc", "certainly", "chunk",

  "clarification", "class", "clearly", "come",

  "complete", "completely", "consequently", "consider",

  "const", "contain", "contains", "continue", "conversely", "correct",
  "correctly", "could", "couldn", "couldnt", "critical", "current",
  "currently", "d",

  "def", "definitely", "dict", "did", "didn", "didnt", "different", "directory",
  "do", "does", "doesn", "doesn",
  "doesnt", "doing", "don", "done", "dont",
  "down", "during", "e", "each", "eh", "eight", "either", "elif", "else",

  "empty", "end", "enough", "entirely", "eprint", "er",
  "essentially", // SHORT NOISE
  "etc", "eventually", "every", "everybody", "everyone", "everything",
  "exactly", "example", "examples", "except", "exe",

  "existing", "expect", "expected", "f", "false",

  "feature", "features", "feel", "few", "finally", "find", "first",
  "five", "folder", "follow", "following", "footer", "for", "format",
  "four", "from", "full", "furthermore", "g",
  "general", "get", "getting", "give",

  // COMMON NON-ACTION VERBS
  "go", "going", "gonna", "gotta",
  "group", "h", "had", "hadn", "hadnt", "has", "hasn",
  "hasnt", "have", "haven", "havent", "having", "he", "header",

  "hello", "help", "hence", "her", "her", // ADVERBS OF PLACE/TIME
  "here", "heres", "hers", "herself",
  "hes", "hey", "hi", // GENERIC ADJECTIVES
  "high", "him", "himself", "his", "hm",
  "hmm", "how",

  // LINKING/TRANSITION WORDS
  "however", "huh", // PRONOUNS - Personal
  "i", "id", "if", "ill", // CONTRACTED FORMS
  "im",
  "immediately", "import", "important", "in", "include", "index", // GENERIC TECHNICAL NOUNS
  "information",
  "inside", "instead", "into", "is", "isn",
  "isnt", "issue", "it", "item", "items", "its",
  "itself", "ive", "j", "js", "json",

  // FILLER/HEDGE WORDS
  "just", "k", "keep", "kind", "kinda", "know", "l", "lambda", "last",
  "later", "least", "len", "less", "let", "lets", "level", "like",
  "likewise", "line", "lines", "list", "literally",
  "ll", "look", "looking", "low", "m", "main",

  "make", "making", "manual", "many", "may", "maybe", "md",
  "me", "mean", "meanwhile", "method", "might", "mine", "mode",
  "more", "moreover", "most", "much", "multiple", "must",

  // PRONOUNS - Possessive
  "my", "myself", "n", "nah", "near", "nearly", "need", "needed",
  "neither", "never", "nevertheless", "new", "next", "nine", // NEGATION
  "no", "nobody",
  "none", "none", "nonetheless", "no one", "nope", "nor",
  "not", "nothing", "now", "o", "obviously", "of",
  "off", "often",

  "oh", "ok", "okay", "on", "one", "ones",
  "only", "onto", "option", "optional", "options",
  "or", "other", "otherwise", "our", "ours",

  "ourselves", "out", "outside", "over", "overall", "p", "part", "parts", "pass",

  "per", "perhaps", "phase",
  "pl", "please",
  "point", "points", "possibly", "pretty", "previously", "primary", "probably",
  "process", "proper", "provide", "provided", "purpose",
  "put", // FILE EXTENSIONS
  "py", "q", "question", // QUERY LANGUAGE
  "questions",
  "quite", "r", "rather",

  // FRAGMENT WORDS
  "re", "real", "really", "recently",

  "region", "remain", "require",

  "required", "result", "return", "right", "s", "same", "say",
  "secondary", // DOCUMENT/CODE STRUCTURE
  "section", "see", "seem",
  // PROGRAMMING KEYWORDS
  "self", "set", "seven", "several",
  "shall", "she", "shes", "should",
  "shouldn", "shouldnt", "show", "similarly", "simple",

  "simply", "since", "single", "six", "so", // QUANTIFIERS
  "some", "somebody", // PRONOUNS - Indefinite
  "someone",
  "something", "sometimes", "somewhat", "soon", "sorta", "source", "specific", "stable",
  "start", "state", "status", "stay", // STRUCTURAL WORDS
  "step", "steps",

  "still", "str", "stuff", "such", "sys", "t",
  "take", "tell", "ten", "that", "thats", "the",
  "their", "theirs", "them", "themselves", "then", "there",

  "therefore", "theres", "these", "they", "theyre", "theyve",
  // OVERLY GENERIC TERMS
  "thing", "things", "think", // PRONOUNS - Demonstrative
  "this", "those", "though", "three",
  "through", "thus", "time", "times",

  // PREPOSITIONS
  "to", "today", "toml", "tomorrow", // SHORT FILLER
  "too", "totally",
  "toward", "towards", "true", "try", "trying", "ts",

  // NUMBER WORDS
  "two", "type", "types", "u", "uh", // SPEECH-TO-TEXT FILLERS (STT artifacts from voice input)
  "um", "under", "unless",

  "until", "up", "upon", "us", "used", "uses", // COMMON CODING TERMS
  "using",
  "v", "value", "ve", "version", "very", "via", "w",
  "wanna", // COMMON REQUEST PHRASES
  "want", "was", "wasn", "wasnt", "way", "ways",
  "we", "well", "were", "weren", "werent", "weve", // QUESTION WORDS
  "what",
  "whats", "when", "whenever", "where", "whereas",

  "wherever", "whether", "which", "while",

  // PRONOUNS - Relative
  "who", "whom", "whos", "whose", "why", "will", "with", "within", "without",

  "won", "wont", "work", "working", "works", "would", "wouldn", "wouldnt", "x", "y", "yaml", "yeah", "yep", "yes",
  "yesterday", "yet", "yield", "you", "youll", "your", "youre", "yours",

  "yourself", "youve", "yup", "z",
]);

/**
 * Filter stop words from text.
 * Splits on whitespace, removes words in STOP_WORDS set and single-char words.
 * See SPEC.md §6.4
 */
export function filterStopWords(text: string): string {
  return text
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word.toLowerCase()))
    .join(" ");
}
