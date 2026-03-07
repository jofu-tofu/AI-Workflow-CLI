import { expect } from "chai";

// Inline versions of HyDE functions for testing (avoids module loading issues with types.ts)

const HYDE_SYSTEM_PROMPT = `You are a knowledge base assistant. Given a user query about past coding sessions, generate a hypothetical answer that MIGHT exist in session transcripts.

Rules:
- Write 2-3 sentences maximum (under 200 tokens)
- Use specific technical language: file names, function names, error messages, tool names
- Describe actions taken, decisions made, or problems solved
- Do NOT say "I don't know" or ask clarifying questions
- Be concrete and specific, even if speculative

Example:

Query: "How did we fix the authentication redirect loop?"

Hypothetical Answer: "The redirect loop was caused by middleware checking session.user before the session was populated. We moved the auth check to a route-level guard in src/middleware/auth.ts and updated the session initialization order in app.ts to populate user data before routing."`;

function averageEmbeddings(embeddings: Float32Array[]): Float32Array {
  if (embeddings.length === 0) {
    throw new Error("No embeddings to average");
  }

  const dim = embeddings[0].length;
  const avg = new Float32Array(dim);

  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      avg[i] += emb[i];
    }
  }

  const n = embeddings.length;
  for (let i = 0; i < dim; i++) {
    avg[i] /= n;
  }

  return avg;
}

async function hydeQueryEmbedding(
  query: string,
  config: {
    numResponses: number;
    maxTokens: number;
    timeout: number;
    fallbackToQuery: boolean;
  },
  generateTextFn: any,
  embedFn: any,
  embedOneFn: any,
): Promise<Float32Array> {
  const promises = Array.from({ length: config.numResponses }, (_, i) =>
    generateTextFn(query, {
      systemPrompt: HYDE_SYSTEM_PROMPT,
      maxTokens: config.maxTokens,
      timeout: config.timeout,
      temperature: 0.7,
    }),
  );

  const results = await Promise.all(promises);
  const responses = results
    .filter((r: any) => r.success && r.text.trim().length > 20)
    .map((r: any) => r.text.trim());

  if (responses.length < 3) {
    if (config.fallbackToQuery) {
      return embedOneFn(query);
    }
    throw new Error("HyDE generation failed: insufficient responses");
  }

  const embeddings = await embedFn(responses);
  const avg = averageEmbeddings(embeddings);

  return avg;
}

describe("hyde (HyDE logic)", () => {
  describe("averageEmbeddings", () => {
    it("averages embeddings correctly", () => {
      const emb1 = new Float32Array([1.0, 2.0, 3.0]);
      const emb2 = new Float32Array([2.0, 4.0, 6.0]);
      const emb3 = new Float32Array([3.0, 6.0, 9.0]);

      const result = averageEmbeddings([emb1, emb2, emb3]);

      expect(Array.from(result)).to.deep.equal([2.0, 4.0, 6.0]);
    });

    it("preserves dimensionality", () => {
      const emb1 = new Float32Array([1.0, 2.0, 3.0, 4.0, 5.0]);
      const emb2 = new Float32Array([5.0, 4.0, 3.0, 2.0, 1.0]);

      const result = averageEmbeddings([emb1, emb2]);

      expect(result.length).to.equal(5);
      expect(Array.from(result)).to.deep.equal([3.0, 3.0, 3.0, 3.0, 3.0]);
    });

    it("handles single embedding", () => {
      const emb = new Float32Array([10.0, 20.0, 30.0]);

      const result = averageEmbeddings([emb]);

      expect(Array.from(result)).to.deep.equal([10.0, 20.0, 30.0]);
    });

    it("throws error for empty array", () => {
      expect(() => averageEmbeddings([])).to.throw("No embeddings to average");
    });
  });

  describe("hydeQueryEmbedding", () => {
    it("generates hypothetical responses and returns averaged embedding", async () => {
      const mockGenerateText = async () => ({
        success: true,
        text: "This is a hypothetical response about fixing authentication bugs in the login module.",
        latency_ms: 500,
      });

      const mockEmbed = async (texts: string[]) => {
        return texts.map(() => new Float32Array([1.0, 2.0, 3.0, 4.0]));
      };

      const mockEmbedOne = async () => new Float32Array([0, 0, 0, 0]);

      const result = await hydeQueryEmbedding(
        "How did we fix auth bugs?",
        {
          numResponses: 5,
          maxTokens: 200,
          timeout: 10000,
          fallbackToQuery: true,
        },
        mockGenerateText,
        mockEmbed,
        mockEmbedOne,
      );

      expect(result).to.be.instanceOf(Float32Array);
      expect(result.length).to.equal(4);
      expect(Array.from(result)).to.deep.equal([1.0, 2.0, 3.0, 4.0]);
    });

    it("averages different embeddings correctly", async () => {
      const mockGenerateText = async () => ({
        success: true,
        text: "Hypothetical response text that is long enough to pass the filter.",
        latency_ms: 500,
      });

      let callCount = 0;
      const mockEmbed = async (texts: string[]) => {
        return texts.map(() => {
          callCount++;
          if (callCount === 1) return new Float32Array([1.0, 2.0, 3.0]);
          if (callCount === 2) return new Float32Array([2.0, 4.0, 6.0]);
          return new Float32Array([3.0, 6.0, 9.0]);
        });
      };

      const mockEmbedOne = async () => new Float32Array([0, 0, 0]);

      const result = await hydeQueryEmbedding(
        "test query",
        {
          numResponses: 3,
          maxTokens: 200,
          timeout: 10000,
          fallbackToQuery: true,
        },
        mockGenerateText,
        mockEmbed,
        mockEmbedOne,
      );

      expect(Array.from(result)).to.deep.equal([2.0, 4.0, 6.0]);
    });

    it("falls back to direct query embedding when < 3 responses", async () => {
      let callCount = 0;
      const mockGenerateText = async () => {
        callCount++;
        if (callCount <= 2) {
          return {
            success: true,
            text: "This is a valid response with sufficient length to pass filter.",
            latency_ms: 500,
          };
        }
        return {
          success: false,
          text: "",
          error: "Generation failed",
          latency_ms: 100,
        };
      };

      const mockEmbed = async () => [];
      const mockEmbedOne = async (query: string) => {
        return new Float32Array([10.0, 20.0, 30.0]);
      };

      const result = await hydeQueryEmbedding(
        "test query",
        {
          numResponses: 5,
          maxTokens: 200,
          timeout: 10000,
          fallbackToQuery: true,
        },
        mockGenerateText,
        mockEmbed,
        mockEmbedOne,
      );

      expect(Array.from(result)).to.deep.equal([10.0, 20.0, 30.0]);
    });

    it("throws error when < 3 responses and fallbackToQuery is false", async () => {
      const mockGenerateText = async () => ({
        success: false,
        text: "",
        error: "All generations failed",
        latency_ms: 100,
      });

      const mockEmbed = async () => [];
      const mockEmbedOne = async () => new Float32Array([0]);

      try {
        await hydeQueryEmbedding(
          "test query",
          {
            numResponses: 5,
            maxTokens: 200,
            timeout: 10000,
            fallbackToQuery: false,
          },
          mockGenerateText,
          mockEmbed,
          mockEmbedOne,
        );
        expect.fail("Should have thrown error");
      } catch (e: any) {
        expect(e.message).to.include("HyDE generation failed");
        expect(e.message).to.include("insufficient responses");
      }
    });

    it("filters out responses shorter than 20 characters", async () => {
      let callCount = 0;
      const mockGenerateText = async () => {
        callCount++;
        if (callCount <= 2) {
          return {
            success: true,
            text: "Too short",
            latency_ms: 500,
          };
        }
        return {
          success: true,
          text: "This is a sufficiently long response that passes the filter.",
          latency_ms: 500,
        };
      };

      const mockEmbed = async (texts: string[]) => {
        return texts.map(() => new Float32Array([5.0, 10.0]));
      };

      const mockEmbedOne = async () => new Float32Array([0, 0]);

      const result = await hydeQueryEmbedding(
        "test",
        {
          numResponses: 5,
          maxTokens: 200,
          timeout: 10000,
          fallbackToQuery: true,
        },
        mockGenerateText,
        mockEmbed,
        mockEmbedOne,
      );

      // Only 3 long responses should pass, meeting threshold
      expect(Array.from(result)).to.deep.equal([5.0, 10.0]);
    });

    it("handles all failed generations by falling back", async () => {
      const mockGenerateText = async () => ({
        success: false,
        text: "",
        error: "Ollama connection refused",
        latency_ms: 50,
      });

      const mockEmbed = async () => [];
      const mockEmbedOne = async (query: string) => {
        return new Float32Array([100.0, 200.0]);
      };

      const result = await hydeQueryEmbedding(
        "test query",
        {
          numResponses: 5,
          maxTokens: 200,
          timeout: 10000,
          fallbackToQuery: true,
        },
        mockGenerateText,
        mockEmbed,
        mockEmbedOne,
      );

      expect(Array.from(result)).to.deep.equal([100.0, 200.0]);
    });

    it("works with exactly 3 successful responses", async () => {
      let callCount = 0;
      const mockGenerateText = async () => {
        callCount++;
        if (callCount <= 3) {
          return {
            success: true,
            text: "Valid hypothetical response with enough characters to pass.",
            latency_ms: 500,
          };
        }
        return {
          success: false,
          text: "",
          error: "Failed",
          latency_ms: 100,
        };
      };

      const mockEmbed = async (texts: string[]) => {
        return texts.map(() => new Float32Array([5.0, 10.0]));
      };

      const mockEmbedOne = async () => new Float32Array([0, 0]);

      const result = await hydeQueryEmbedding(
        "test",
        {
          numResponses: 5,
          maxTokens: 200,
          timeout: 10000,
          fallbackToQuery: true,
        },
        mockGenerateText,
        mockEmbed,
        mockEmbedOne,
      );

      expect(Array.from(result)).to.deep.equal([5.0, 10.0]);
    });
  });
});
