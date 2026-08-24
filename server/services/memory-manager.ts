import { GoogleGenAI } from "@google/genai";
import { db } from "../db";
import { chatEmbeddings } from "@shared/schema";
import { cosineDistance, desc, gt, sql } from "drizzle-orm";

// Initialize Gemini client (lightweight usage for embeddings)
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export class MemoryManager {
    private model = "gemini-embedding-001";
    private dim = 768;

    async getEmbedding(text: string): Promise<number[] | null> {
        try {
            const result: any = await genAI.models.embedContent({
                model: this.model,
                contents: [
                    {
                        role: "user",
                        parts: [{ text }]
                    }
                ],
                config: { outputDimensionality: this.dim }
            });
            return result?.embedding?.values ?? result?.embeddings?.[0]?.values ?? null;
        } catch (error) {
            console.error("Error generating embedding:", error);
            return null;
        }
    }

    async storeMessage(content: string, metadata: Record<string, any>) {
        try {
            const embedding = await this.getEmbedding(content);
            if (!embedding) return;

            await db.insert(chatEmbeddings).values({
                content,
                embedding: embedding,
                metadata
            });
            console.log(`[Memory] Stored message: "${content.substring(0, 30)}..."`);
        } catch (error) {
            console.error("Error storing memory:", error);
        }
    }

    async search(query: string, limit: number = 5, threshold: number = 0.5) {
        try {
            const queryEmbedding = await this.getEmbedding(query);
            if (!queryEmbedding) return [];

            const similarity = sql<number>`1 - (${chatEmbeddings.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)`;

            const results = await db
                .select({
                    content: chatEmbeddings.content,
                    metadata: chatEmbeddings.metadata,
                    similarity
                })
                .from(chatEmbeddings)
                .where(gt(similarity, threshold))
                .orderBy(desc(similarity))
                .limit(limit);

            return results;
        } catch (error) {
            console.error("Error searching memory:", error);
            return [];
        }
    }
}

export const memoryManager = new MemoryManager();
