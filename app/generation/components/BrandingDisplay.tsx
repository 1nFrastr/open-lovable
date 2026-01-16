'use client';

import React from 'react';
import Image from 'next/image';

interface BrandingData {
  colorScheme?: string;
  colors?: {
    primary?: string;
    accent?: string;
    background?: string;
    textPrimary?: string;
  };
  typography?: {
    fontFamilies?: {
      primary?: string;
      heading?: string;
    };
    fontSizes?: {
      h1?: string;
      h2?: string;
      body?: string;
    };
  };
  spacing?: {
    baseUnit?: number;
    borderRadius?: string;
  };
  components?: {
    buttonPrimary?: {
      background: string;
      textColor: string;
      borderRadius: string;
      shadow?: string;
    };
    buttonSecondary?: {
      background: string;
      textColor: string;
      borderRadius: string;
      shadow?: string;
    };
  };
  personality?: {
    tone?: string;
    energy?: string;
    targetAudience?: string;
  };
}

interface BrandingDisplayProps {
  brandingData: BrandingData;
  sourceUrl: string;
}

export function BrandingDisplay({ brandingData, sourceUrl }: BrandingDisplayProps) {
  return (
    <div className="mt-3 bg-gradient-to-br from-gray-50 to-white border-2 border-gray-200 rounded-xl overflow-hidden max-w-[500px] shadow-sm">
      <div className="bg-[#36322F] px-16 py-12">
        <div className="flex items-center gap-8">
          <Image
            src={`https://www.google.com/s2/favicons?domain=${sourceUrl}&sz=32`}
            alt=""
            width={64}
            height={64}
            className="w-16 h-16"
          />
          <div className="text-sm font-semibold text-white">Brand Guidelines</div>
        </div>
      </div>

      <div className="p-16">
        {/* Color Scheme Mode */}
        {brandingData.colorScheme && (
          <div className="mb-16">
            <div className="text-sm">
              <span className="text-gray-600 font-medium">Mode:</span>{' '}
              <span className="font-semibold text-gray-900 capitalize">
                {brandingData.colorScheme}
              </span>
            </div>
          </div>
        )}

        {/* Colors */}
        {brandingData.colors && (
          <div className="mb-16">
            <div className="text-sm font-semibold text-gray-900 mb-8">Colors</div>
            <div className="flex flex-wrap gap-12">
              {brandingData.colors.primary && (
                <ColorSwatch label="Primary" color={brandingData.colors.primary} />
              )}
              {brandingData.colors.accent && (
                <ColorSwatch label="Accent" color={brandingData.colors.accent} />
              )}
              {brandingData.colors.background && (
                <ColorSwatch label="Background" color={brandingData.colors.background} />
              )}
              {brandingData.colors.textPrimary && (
                <ColorSwatch label="Text" color={brandingData.colors.textPrimary} />
              )}
            </div>
          </div>
        )}

        {/* Typography */}
        {brandingData.typography && (
          <div className="mb-16">
            <div className="text-sm font-semibold text-gray-900 mb-8">Typography</div>
            <div className="grid grid-cols-2 gap-12 text-sm">
              {brandingData.typography.fontFamilies?.primary && (
                <div>
                  <span className="text-gray-600 font-medium">Primary:</span>{' '}
                  <span className="font-semibold text-gray-900">
                    {brandingData.typography.fontFamilies.primary}
                  </span>
                </div>
              )}
              {brandingData.typography.fontFamilies?.heading && (
                <div>
                  <span className="text-gray-600 font-medium">Heading:</span>{' '}
                  <span className="font-semibold text-gray-900">
                    {brandingData.typography.fontFamilies.heading}
                  </span>
                </div>
              )}
              {brandingData.typography.fontSizes?.h1 && (
                <div>
                  <span className="text-gray-600 font-medium">H1 Size:</span>{' '}
                  <span className="font-semibold text-gray-900">
                    {brandingData.typography.fontSizes.h1}
                  </span>
                </div>
              )}
              {brandingData.typography.fontSizes?.h2 && (
                <div>
                  <span className="text-gray-600 font-medium">H2 Size:</span>{' '}
                  <span className="font-semibold text-gray-900">
                    {brandingData.typography.fontSizes.h2}
                  </span>
                </div>
              )}
              {brandingData.typography.fontSizes?.body && (
                <div>
                  <span className="text-gray-600 font-medium">Body Size:</span>{' '}
                  <span className="font-semibold text-gray-900">
                    {brandingData.typography.fontSizes.body}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Spacing */}
        {brandingData.spacing && (
          <div className="mb-16">
            <div className="text-sm font-semibold text-gray-900 mb-8">Spacing</div>
            <div className="flex flex-wrap gap-16 text-sm">
              {brandingData.spacing.baseUnit && (
                <div>
                  <span className="text-gray-600 font-medium">Base Unit:</span>{' '}
                  <span className="font-semibold text-gray-900">
                    {brandingData.spacing.baseUnit}px
                  </span>
                </div>
              )}
              {brandingData.spacing.borderRadius && (
                <div>
                  <span className="text-gray-600 font-medium">Border Radius:</span>{' '}
                  <span className="font-semibold text-gray-900">
                    {brandingData.spacing.borderRadius}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Button Styles */}
        {brandingData.components?.buttonPrimary && (
          <div className="mb-16">
            <div className="text-sm font-semibold text-gray-900 mb-8">Button Styles</div>
            <div className="flex flex-wrap gap-12">
              <div>
                <div className="text-xs text-gray-600 mb-6 font-medium">Primary Button</div>
                <button
                  className="px-16 py-8 text-sm font-medium"
                  style={{
                    backgroundColor: brandingData.components.buttonPrimary.background,
                    color: brandingData.components.buttonPrimary.textColor,
                    borderRadius: brandingData.components.buttonPrimary.borderRadius,
                    boxShadow: brandingData.components.buttonPrimary.shadow,
                  }}
                >
                  Sample Button
                </button>
              </div>
              {brandingData.components?.buttonSecondary && (
                <div>
                  <div className="text-xs text-gray-600 mb-6 font-medium">Secondary Button</div>
                  <button
                    className="px-16 py-8 text-sm font-medium"
                    style={{
                      backgroundColor: brandingData.components.buttonSecondary.background,
                      color: brandingData.components.buttonSecondary.textColor,
                      borderRadius: brandingData.components.buttonSecondary.borderRadius,
                      boxShadow: brandingData.components.buttonSecondary.shadow,
                    }}
                  >
                    Sample Button
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Personality */}
        {brandingData.personality && (
          <div className="text-sm">
            <span className="text-gray-600 font-medium">Personality:</span>{' '}
            <span className="font-semibold text-gray-900 capitalize">
              {brandingData.personality.tone} tone, {brandingData.personality.energy} energy
            </span>
          </div>
        )}

        {/* Target Audience */}
        {brandingData.personality?.targetAudience && (
          <div className="text-sm mt-8">
            <span className="text-gray-600 font-medium">Target:</span>{' '}
            <span className="text-gray-900">{brandingData.personality.targetAudience}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ColorSwatch({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-8">
      <div
        className="w-32 h-32 rounded border border-gray-300"
        style={{ backgroundColor: color }}
      />
      <div className="text-sm">
        <div className="font-semibold text-gray-900">{label}</div>
        <div className="text-gray-600 font-mono text-xs">{color}</div>
      </div>
    </div>
  );
}

export default BrandingDisplay;
