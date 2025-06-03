// src/ai/flows/suggest-document-keywords.ts
'use server';

/**
 * @fileOverview A document keyword suggestion AI agent.
 *
 * - suggestDocumentKeywords - A function that suggests keywords for a document.
 * - SuggestDocumentKeywordsInput - The input type for the suggestDocumentKeywords function.
 * - SuggestDocumentKeywordsOutput - The return type for the suggestDocumentKeywords function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestDocumentKeywordsInputSchema = z.object({
  documentText: z
    .string()
    .describe('The text content of the document to suggest keywords for.'),
});
export type SuggestDocumentKeywordsInput = z.infer<
  typeof SuggestDocumentKeywordsInputSchema
>;

const SuggestDocumentKeywordsOutputSchema = z.object({
  keywords: z
    .array(z.string())
    .describe('An array of relevant keywords for the document.'),
});
export type SuggestDocumentKeywordsOutput = z.infer<
  typeof SuggestDocumentKeywordsOutputSchema
>;

export async function suggestDocumentKeywords(
  input: SuggestDocumentKeywordsInput
): Promise<SuggestDocumentKeywordsOutput> {
  return suggestDocumentKeywordsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestDocumentKeywordsPrompt',
  input: {schema: SuggestDocumentKeywordsInputSchema},
  output: {schema: SuggestDocumentKeywordsOutputSchema},
  prompt: `You are an expert at identifying keywords in documents.

  Given the following document text, suggest a list of keywords that would be helpful for categorizing and searching for this document. Return the keywords as a JSON array of strings.

  Document Text: {{{documentText}}}`,
});

const suggestDocumentKeywordsFlow = ai.defineFlow(
  {
    name: 'suggestDocumentKeywordsFlow',
    inputSchema: SuggestDocumentKeywordsInputSchema,
    outputSchema: SuggestDocumentKeywordsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
