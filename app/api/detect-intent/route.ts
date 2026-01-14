import { NextRequest, NextResponse } from 'next/server';
import { AI_TEMPLATES, DEFAULT_TEMPLATE, getTemplateByName } from '@/config/templates';
import { buildTemplateSelectionPrompt, parseTemplateSelection } from '@/lib/template-project';
import type { DetectIntentRequest, DetectIntentResponse } from '@/types/template';

/**
 * POST /api/detect-intent
 * 
 * Analyzes user input to detect their intent and recommend the best starter template.
 * Uses OpenAI API to understand the user's project requirements.
 */
export async function POST(request: NextRequest): Promise<NextResponse<DetectIntentResponse>> {
  try {
    // Handle empty body
    let body: DetectIntentRequest;
    try {
      const text = await request.text();
      if (!text || text.trim() === '') {
        console.warn('[detect-intent] Empty request body received');
        return NextResponse.json({
          template: DEFAULT_TEMPLATE,
          title: 'New Project',
          error: 'Empty request body'
        }, { status: 400 });
      }
      body = JSON.parse(text);
    } catch (parseError) {
      console.error('[detect-intent] JSON parse error:', parseError);
      return NextResponse.json({
        template: DEFAULT_TEMPLATE,
        title: 'New Project',
        error: 'Invalid JSON in request body'
      }, { status: 400 });
    }
    
    const { message, model } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { template: DEFAULT_TEMPLATE, title: 'Untitled Project', error: 'Message is required' },
        { status: 400 }
      );
    }

    // Check for OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.warn('[detect-intent] OPENAI_API_KEY not configured, using default template');
      return NextResponse.json({
        template: DEFAULT_TEMPLATE,
        title: 'New Project',
        error: 'OpenAI API key not configured'
      });
    }

    // Build the system prompt
    const systemPrompt = buildTemplateSelectionPrompt(AI_TEMPLATES);

    console.log('[detect-intent] Detecting intent for:', message.substring(0, 100));

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[detect-intent] OpenAI API error:', errorText);
      return NextResponse.json({
        template: DEFAULT_TEMPLATE,
        title: 'New Project',
        error: `OpenAI API error: ${response.status}`
      });
    }

    const data = await response.json();
    const llmResponse = data.choices?.[0]?.message?.content;

    if (!llmResponse) {
      console.error('[detect-intent] No response from OpenAI');
      return NextResponse.json({
        template: DEFAULT_TEMPLATE,
        title: 'New Project',
        error: 'No response from AI'
      });
    }

    console.log('[detect-intent] LLM response:', llmResponse);

    // Parse the template selection
    const selection = parseTemplateSelection(llmResponse);

    if (!selection) {
      console.warn('[detect-intent] Failed to parse selection, using default');
      return NextResponse.json({
        template: DEFAULT_TEMPLATE,
        title: 'New Project'
      });
    }

    // Validate template exists
    const template = getTemplateByName(selection.template);
    if (!template && selection.template !== 'blank') {
      console.warn(`[detect-intent] Unknown template "${selection.template}", using default`);
      return NextResponse.json({
        template: DEFAULT_TEMPLATE,
        title: selection.title
      });
    }

    console.log('[detect-intent] Selected template:', selection.template, 'Title:', selection.title);

    return NextResponse.json({
      template: selection.template,
      title: selection.title
    });

  } catch (error) {
    console.error('[detect-intent] Error:', error);
    return NextResponse.json({
      template: DEFAULT_TEMPLATE,
      title: 'New Project',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
