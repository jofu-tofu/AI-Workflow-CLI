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
  "a", "an", "the",

  // PREPOSITIONS
  "to", "for", "in", "on", "at", "by", "with", "from", "of", "about",
  "into", "over", "under", "between", "through", "during", "before", "after",
  "above", "below", "against", "among", "around", "behind", "beside", "besides",
  "beyond", "down", "inside", "outside", "near", "off", "onto", "out",
  "since", "toward", "towards", "until", "upon", "within", "without",
  "across", "along", "via", "per",

  // PRONOUNS - Personal
  "i", "you", "he", "she", "it", "we", "they",
  "me", "him", "her", "us", "them",
  "myself", "yourself", "himself", "herself", "itself", "ourselves", "themselves",

  // PRONOUNS - Possessive
  "my", "your", "his", "her", "its", "our", "their",
  "mine", "yours", "hers", "ours", "theirs",

  // PRONOUNS - Demonstrative
  "this", "that", "these", "those",

  // PRONOUNS - Relative
  "who", "whom", "whose", "which",

  // PRONOUNS - Indefinite
  "someone", "somebody", "something", "anyone", "anybody", "anything",
  "everyone", "everybody", "everything", "no one", "nobody", "nothing",
  "one", "ones",

  // AUXILIARY/MODAL VERBS
  "am", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "having",
  "do", "does", "did", "doing", "done",
  "can", "could", "will", "would", "shall", "should", "may", "might", "must",

  // CONJUNCTIONS
  "and", "or", "but", "nor", "so", "yet",
  "if", "then", "else", "whether", "unless", "although", "though",
  "because", "while", "whereas", "whenever", "wherever",

  // QUESTION WORDS
  "what", "when", "where", "why", "how",

  // ADVERBS OF PLACE/TIME
  "here", "there", "now", "always", "never", "often", "sometimes",
  "already", "still", "soon", "later", "ago", "today", "tomorrow",
  "yesterday", "currently", "previously", "recently", "immediately",
  "finally", "eventually", "meanwhile", "afterwards",

  // NEGATION
  "no", "not", "none", "neither",
  "don", "doesn", "didn", "won", "wouldn", "couldn", "shouldn",
  "isn", "aren", "wasn", "weren", "hasn", "haven", "hadn",

  // QUANTIFIERS
  "some", "any", "all", "each", "every", "both", "few", "more", "most",
  "many", "much", "several", "other", "another", "enough", "less", "least",
  "either", "such",

  // FILLER/HEDGE WORDS
  "just", "also", "only", "really", "actually", "basically", "simply",
  "very", "quite", "rather", "pretty", "somewhat", "almost", "nearly",
  "exactly", "completely", "entirely", "totally", "absolutely",
  "probably", "possibly", "maybe", "perhaps", "definitely", "certainly",
  "apparently", "obviously", "clearly", "literally", "essentially",

  // SPEECH-TO-TEXT FILLERS (STT artifacts from voice input)
  "um", "uh", "ah", "oh", "hmm", "hm", "er", "eh", "huh",
  "hey", "hi", "hello", "yeah", "yep", "yup", "nah", "nope",
  "gonna", "gotta", "wanna", "kinda", "sorta",
  "stuff", "anyway", "anyways", "alright", "right", "well",

  // COMMON REQUEST PHRASES
  "want", "need", "help", "please", "like", "let", "get",
  "think", "know", "see", "try", "make", "give", "take",
  "look", "looking", "trying", "going", "getting", "making",

  // COMMON NON-ACTION VERBS
  "go", "come", "put", "say", "tell", "ask", "find", "keep",
  "seem", "appear", "become", "remain", "stay", "feel", "show", "mean",
  "include", "provide", "require", "allow", "expect", "cause",
  "follow", "consider", "continue", "start", "begin", "end",
  "contain", "contains",

  // LINKING/TRANSITION WORDS
  "however", "therefore", "thus", "hence", "otherwise", "instead",
  "moreover", "furthermore", "nevertheless", "nonetheless", "accordingly",
  "consequently", "similarly", "likewise", "conversely", "alternatively",

  // FILE EXTENSIONS
  "py", "md", "ts", "json", "js", "yaml", "toml", "exe", "bat",

  // COMMON CODING TERMS
  "using", "used", "uses",
  "based", "following",
  "same", "different", "specific", "existing", "new", "current", "first",
  "full", "complete", "single", "multiple", "simple",
  "needed", "required", "provided", "expected", "correctly",
  "works", "working", "work",

  // STRUCTURAL WORDS
  "step", "steps", "phase", "below",

  // QUERY LANGUAGE
  "questions", "question", "clarification",

  // OVERLY GENERIC TERMS
  "thing", "things", "way", "ways", "kind", "type", "types",
  "example", "examples", "case", "cases",
  "part", "parts", "point", "points",
  "time", "times", "next", "last",
  "set", "list", "group", "item", "items",

  // PROGRAMMING KEYWORDS
  "self", "def", "return", "import", "true", "false", "none", "str",
  "const", "async", "class", "assert", "except", "dict", "len", "args",
  "sys", "eprint", "elif", "lambda", "yield", "pass",

  // GENERIC ADJECTIVES
  "high", "low", "important", "critical", "optional", "manual",
  "real", "empty", "stable", "active", "proper", "correct",
  "basic", "main", "primary", "secondary", "general", "overall",

  // GENERIC TECHNICAL NOUNS
  "information", "format", "status", "method", "purpose", "result",
  "source", "value", "option", "options", "feature", "features", "issue",
  "process", "version", "mode", "state",

  // DOCUMENT/CODE STRUCTURE
  "section", "lines", "line", "folder", "directory", "index",
  "level", "block", "chunk", "region", "header", "footer",

  // FRAGMENT WORDS
  "re", "pl", "aiw", "ve", "ll", "doesn", "t", "s",

  // CONTRACTED FORMS
  "im", "ive", "id", "ill", "youre", "youve", "youll",
  "hes", "shes", "weve", "theyre", "theyve", "dont", "doesnt",
  "didnt", "wont", "wouldnt", "cant", "couldnt", "shouldnt", "isnt",
  "arent", "wasnt", "werent", "hasnt", "havent", "hadnt", "lets",
  "thats", "whats", "heres", "theres", "whos",

  // SHORT NOISE
  "etc", "up", "as", "cc",

  // NUMBER WORDS
  "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",

  // SINGLE LETTERS
  "b", "c", "d", "e", "f", "g", "h", "j", "k", "l", "m", "n", "o", "p",
  "q", "r", "u", "v", "w", "x", "y", "z",

  // SHORT FILLER
  "too", "yes", "ok", "okay",
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
