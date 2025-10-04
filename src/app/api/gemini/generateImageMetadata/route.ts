import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import fetch from "node-fetch";

// Access Gemini API key from environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("Gemini API key not configured. Set 'GEMINI_API_KEY' in your environment config.");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "");

export async function POST(request: NextRequest) {
  // Set CORS headers for preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3000',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '3600',
      },
    });
  }

  const { imageUrl, componentDescription } = await request.json();

  if (!imageUrl || !componentDescription) {
    return NextResponse.json(
      {
        error: {
          message: "The function must be called with 'imageUrl' and 'componentDescription'.",
          code: "invalid-argument",
        },
      },
      { status: 400 }
    );
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `Analyze the provided image and the component description. Generate a concise image description and a list of relevant tags for use in an AI agent automating Instagram posts. The output should be a JSON object with two fields: "description" (string) and "tags" (array of strings). All textual output, including the description and tags, should be in Portuguese.

      Component Description: "${componentDescription}"`;

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image from URL: ${imageUrl}`);
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageData = Buffer.from(imageBuffer).toString("base64");

    const imagePart: Part = {
      inlineData: {
        mimeType: imageResponse.headers.get('content-type') || "image/jpeg", // Use content-type from response or default
        data: imageData,
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const geminiResponse = result.response;
    let text = geminiResponse.text();

    // Remove markdown code block fences if present
    if (text.startsWith('```json') && text.endsWith('```')) {
      text = text.substring(7, text.length - 3).trim();
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(text);
    } catch (jsonError) {
      console.error("Failed to parse Gemini response as JSON:", text, jsonError);
      return NextResponse.json(
        {
          error: {
            message: "Gemini API returned an unparseable response.",
            code: "internal",
          },
        },
        { status: 500 }
      );
    }

    if (!parsedResponse.description || !Array.isArray(parsedResponse.tags)) {
      return NextResponse.json(
        {
          error: {
            message: "Gemini API response missing 'description' or 'tags' array.",
            code: "internal",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        description: parsedResponse.description,
        tags: parsedResponse.tags,
      },
    });
  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    return NextResponse.json(
      {
        error: {
          message: "Failed to generate image metadata with Gemini.",
          code: "internal",
          details: error.message,
        },
      },
      { status: 500 }
    );
  }
}
