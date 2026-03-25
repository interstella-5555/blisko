-- T2 quick-score writes score-only rows without text.
-- shortSnippet and longDescription need to be nullable so T2 can insert without generating text.
ALTER TABLE "connection_analyses" ALTER COLUMN "short_snippet" DROP NOT NULL;
ALTER TABLE "connection_analyses" ALTER COLUMN "long_description" DROP NOT NULL;
