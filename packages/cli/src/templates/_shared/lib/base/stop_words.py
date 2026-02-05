"""Stop words for context ID generation.

Generated from analysis of 1,424 prompts, context summaries, and plan files.
Words that appear frequently but don't help identify the specific task.

Categories organized for maintainability. Add new corpus-derived words to
the appropriate category or to "Corpus-derived additions" at the end.

ACTION VERBS ARE INTENTIONALLY EXCLUDED from this list:
add, fix, update, create, implement, refactor, migrate, debug, remove, change,
move, rename, delete, build, test, deploy, verify, analyze, modify, write, run,
check, replace, save, sync, load, extract, install, refactor, clean, merge, etc.

These action verbs should REMAIN in context IDs as they identify the task type.
"""

STOP_WORDS = {
    # ========================================================================
    # ARTICLES
    # ========================================================================
    'a', 'an', 'the',

    # ========================================================================
    # PREPOSITIONS
    # ========================================================================
    'to', 'for', 'in', 'on', 'at', 'by', 'with', 'from', 'of', 'about',
    'into', 'over', 'under', 'between', 'through', 'during', 'before', 'after',
    'above', 'below', 'against', 'among', 'around', 'behind', 'beside', 'besides',
    'beyond', 'down', 'inside', 'outside', 'near', 'off', 'onto', 'out',
    'since', 'toward', 'towards', 'until', 'upon', 'within', 'without',
    'across', 'along', 'via', 'per',

    # ========================================================================
    # PRONOUNS
    # ========================================================================
    # Personal pronouns
    'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'me', 'him', 'her', 'us', 'them',
    'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves',

    # Possessive pronouns
    'my', 'your', 'his', 'her', 'its', 'our', 'their',
    'mine', 'yours', 'hers', 'ours', 'theirs',

    # Demonstrative pronouns
    'this', 'that', 'these', 'those',

    # Relative pronouns
    'who', 'whom', 'whose', 'which', 'that',

    # Indefinite pronouns
    'someone', 'somebody', 'something', 'anyone', 'anybody', 'anything',
    'everyone', 'everybody', 'everything', 'no one', 'nobody', 'nothing',
    'one', 'ones',

    # ========================================================================
    # AUXILIARY/MODAL VERBS
    # ========================================================================
    'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'having',
    'do', 'does', 'did', 'doing', 'done',
    'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',

    # ========================================================================
    # CONJUNCTIONS
    # ========================================================================
    'and', 'or', 'but', 'nor', 'so', 'yet', 'for',
    'if', 'then', 'else', 'whether', 'unless', 'although', 'though',
    'because', 'since', 'while', 'whereas', 'whenever', 'wherever',

    # ========================================================================
    # QUESTION WORDS
    # ========================================================================
    'what', 'when', 'where', 'why', 'how',

    # ========================================================================
    # ADVERBS OF PLACE/TIME
    # ========================================================================
    'here', 'there', 'now', 'then', 'always', 'never', 'often', 'sometimes',
    'already', 'still', 'yet', 'soon', 'later', 'ago', 'today', 'tomorrow',
    'yesterday', 'currently', 'previously', 'recently', 'immediately',
    'finally', 'eventually', 'meanwhile', 'afterwards',

    # ========================================================================
    # NEGATION
    # ========================================================================
    'no', 'not', 'none', 'never', 'neither', 'nor',
    'don', 'doesn', 'didn', 'won', 'wouldn', 'couldn', 'shouldn',
    'isn', 'aren', 'wasn', 'weren', 'hasn', 'haven', 'hadn',

    # ========================================================================
    # QUANTIFIERS
    # ========================================================================
    'some', 'any', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
    'many', 'much', 'several', 'other', 'another', 'enough', 'less', 'least',
    'either', 'neither', 'such',

    # ========================================================================
    # FILLER/HEDGE WORDS
    # ========================================================================
    'just', 'also', 'only', 'really', 'actually', 'basically', 'simply',
    'very', 'quite', 'rather', 'pretty', 'somewhat', 'almost', 'nearly',
    'exactly', 'completely', 'entirely', 'totally', 'absolutely',
    'probably', 'possibly', 'maybe', 'perhaps', 'definitely', 'certainly',
    'apparently', 'obviously', 'clearly', 'literally', 'essentially',

    # ========================================================================
    # COMMON REQUEST PHRASES (from corpus: high frequency in prompts)
    # ========================================================================
    'want', 'need', 'help', 'please', 'like', 'let', 'get',
    'think', 'know', 'see', 'try', 'make', 'give', 'take',
    'look', 'looking', 'trying', 'going', 'getting', 'making',

    # ========================================================================
    # COMMON NON-ACTION VERBS
    # ========================================================================
    'go', 'come', 'put', 'say', 'tell', 'ask', 'find', 'keep',
    'seem', 'appear', 'become', 'remain', 'stay', 'feel', 'show', 'mean',
    'include', 'provide', 'require', 'allow', 'expect', 'cause',
    'follow', 'consider', 'continue', 'start', 'begin', 'end',
    'contain', 'contain', 'contains',

    # ========================================================================
    # LINKING/TRANSITION WORDS
    # ========================================================================
    'however', 'therefore', 'thus', 'hence', 'otherwise', 'instead',
    'moreover', 'furthermore', 'nevertheless', 'nonetheless', 'accordingly',
    'consequently', 'similarly', 'likewise', 'conversely', 'alternatively',

    # ========================================================================
    # CORPUS-DERIVED HIGH-FREQUENCY NOISE (from 1,424 docs analysis)
    # ========================================================================
    # Words appearing in >10% of documents that don't identify the task

    # File extensions/technical noise (appear in paths, not task descriptors)
    'py', 'md', 'ts', 'json', 'js', 'yaml', 'toml', 'exe', 'bat',

    # Common Claude/coding terms that don't identify specific tasks
    'using', 'used', 'uses',
    'based', 'following',
    'same', 'different', 'specific', 'existing', 'new', 'current', 'first',
    'full', 'complete', 'single', 'multiple', 'simple',
    'needed', 'required', 'provided', 'expected', 'correctly',
    'works', 'working', 'work',

    # Common structural words from plan files
    'step', 'steps', 'phase', 'below', 'above',

    # Query/clarification language (high frequency in prompts)
    'questions', 'question', 'clarification',

    # Overly generic terms
    'thing', 'things', 'way', 'ways', 'kind', 'type', 'types',
    'example', 'examples', 'case', 'cases',
    'part', 'parts', 'point', 'points',
    'time', 'times', 'next', 'last', 'end',
    'set', 'list', 'group', 'item', 'items',

    # ========================================================================
    # PROGRAMMING KEYWORDS (code tokens that leak from pasted code)
    # ========================================================================
    'self', 'def', 'return', 'import', 'true', 'false', 'none', 'str',
    'const', 'async', 'class', 'assert', 'except', 'dict', 'len', 'args',
    'sys', 'eprint', 'elif', 'lambda', 'yield', 'pass',

    # ========================================================================
    # GENERIC ADJECTIVES (non-specific modifiers)
    # ========================================================================
    'high', 'low', 'important', 'critical', 'optional', 'manual',
    'real', 'empty', 'stable', 'active', 'proper', 'correct',
    'basic', 'main', 'primary', 'secondary', 'general', 'overall',

    # ========================================================================
    # GENERIC TECHNICAL NOUNS (common but non-specific)
    # ========================================================================
    'information', 'format', 'status', 'method', 'purpose', 'result',
    'source', 'value', 'option', 'options', 'feature', 'features', 'issue',
    'process', 'version', 'mode', 'state',

    # ========================================================================
    # DOCUMENT/CODE STRUCTURE (generic structural terms)
    # ========================================================================
    'section', 'lines', 'line', 'folder', 'directory', 'index',
    'level', 'block', 'chunk', 'region', 'header', 'footer',

    # ========================================================================
    # FRAGMENT WORDS (artifacts from contractions/tokenization)
    # ========================================================================
    're', 'pl', 'aiw', 've', 'll', 'doesn', 't', 's',
}
