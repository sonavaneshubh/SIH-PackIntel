'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { ConfidenceBadge } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase/client';
import { InspectionImage, ExtractedLabel } from '@/types/database';
import { getSignedImageUrl, logSupabaseError } from '@/lib/supabase/inspectionService';

interface ExtractedEntity {
  id: string;
  name: string;
  extractedValue: string;
  confidence: number;
  colorDot: string;
}

export function OcrAnalysisView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inspectionId = searchParams.get('inspection');

  const [image, setImage] = useState<InspectionImage | null>(null);
  const [extractedLabel, setExtractedLabel] = useState<ExtractedLabel | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string>('');
  const [entities, setEntities] = useState<ExtractedEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeBoundingBoxId, setActiveBoundingBoxId] = useState<string | null>(null);

  useEffect(() => {
    if (!inspectionId) {
      setError('No inspection ID provided');
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch inspection image safely with fallback for column names
        let images: InspectionImage[] | null = null;
        let imgError: any = null;

        const res1 = await supabase
          .from('inspection_images')
          .select('*')
          .eq('inspection_id', inspectionId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (res1.error) {
          logSupabaseError('OcrAnalysisView:fetchImageCreated', res1.error);
          const res2 = await supabase
            .from('inspection_images')
            .select('*')
            .eq('inspection_id', inspectionId)
            .limit(1);
          if (res2.error) {
            logSupabaseError('OcrAnalysisView:fetchImageFallback', res2.error);
          }
          images = res2.data;
          imgError = res2.error;
        } else {
          images = res1.data;
        }

        if (imgError) throw imgError;

        if (images && images.length > 0) {
          setImage(images[0]);
          if (images[0].ocr_text) {
            setOcrText(images[0].ocr_text);
          }

          // Get signed URL for private bucket
          const { url } = await getSignedImageUrl(images[0].storage_path);
          if (url) setSignedUrl(url);
        }

        // Fetch extracted labels
        const { data: labels, error: labelError } = await supabase
          .from('extracted_labels')
          .select('*')
          .eq('inspection_id', inspectionId)
          .single();

        if (labelError && labelError.code !== 'PGRST116') {
          throw labelError;
        }

        if (labels) {
          setExtractedLabel(labels);
          // Real OCR confidence from the data layer; never fabricated.
          const ocrConf = labels.ocr_confidence ?? labels.extraction_confidence ?? 0;
          // Build entities from extracted label
          const entityList: ExtractedEntity[] = [
            { id: '1', name: 'Manufacturer', extractedValue: labels.manufacturer_name || 'Not detected', confidence: ocrConf, colorDot: 'bg-blue-500' },
            { id: '2', name: 'Packer', extractedValue: labels.packer_name || 'Not detected', confidence: ocrConf, colorDot: 'bg-indigo-500' },
            { id: '3', name: 'Importer', extractedValue: labels.importer_name || 'Not detected', confidence: ocrConf, colorDot: 'bg-purple-500' },
            { id: '4', name: 'Commodity Name', extractedValue: labels.commodity_name || 'Not detected', confidence: ocrConf, colorDot: 'bg-green-500' },
            { id: '5', name: 'Net Quantity', extractedValue: labels.net_quantity || 'Not detected', confidence: ocrConf, colorDot: 'bg-teal-500' },
            { id: '6', name: 'MRP', extractedValue: labels.mrp || 'Not detected', confidence: ocrConf, colorDot: 'bg-amber-500' },
            { id: '7', name: 'Month/Year Packed', extractedValue: labels.month_year_packed || 'Not detected', confidence: ocrConf, colorDot: 'bg-orange-500' },
            { id: '8', name: 'Consumer Care', extractedValue: labels.customer_care_details || 'Not detected', confidence: ocrConf, colorDot: 'bg-pink-500' },
            { id: '9', name: 'Country of Origin', extractedValue: labels.country_of_origin || 'Not detected', confidence: ocrConf, colorDot: 'bg-red-500' },
          ].filter(e => e.extractedValue !== 'Not detected');

          setEntities(entityList);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load OCR data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [inspectionId]);

  const handleEntityHover = (id: string) => {
    setActiveBoundingBoxId(id);
  };

  // Real bounding boxes: match entity values to OCR word regions (normalized
  // 0-1 coordinates stored by the backend) and draw the union box.
  interface RegionBox { left: number; top: number; width: number; height: number; }
  interface OcrRegion { text: string; left: number; top: number; width: number; height: number; }
  const ocrRegions = (image?.ocr_regions || []) as OcrRegion[];
  const regionBoxFor = (value: string): RegionBox | null => {
    const target = value.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!target || target.length < 2) return null;
    const matches = ocrRegions.filter(region => {
      const regionText = (region.text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return regionText.length >= 2 && target.includes(regionText);
    });
    if (!matches.length) return null;
    return {
      left: Math.min(...matches.map(r => r.left)),
      top: Math.min(...matches.map(r => r.top)),
      width: Math.max(...matches.map(r => r.left + r.width)) - Math.min(...matches.map(r => r.left)),
      height: Math.max(...matches.map(r => r.top + r.height)) - Math.min(...matches.map(r => r.top)),
    };
  };

  if (isLoading) {
    return (
      <AppShell pageTitle="OCR Extraction">
        <div className="max-w-5xl mx-auto w-full flex flex-col items-center justify-center py-12">
          <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-4">autorenew</span>
          <p className="text-body-base text-on-surface-variant">Loading OCR analysis...</p>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell pageTitle="OCR Extraction Error">
        <div className="max-w-md mx-auto text-center py-12">
          <span className="material-symbols-outlined text-6xl text-error mb-4">error</span>
          <h2 className="text-headline-lg font-headline-lg text-on-surface mb-2">Failed to Load OCR Data</h2>
          <p className="text-body-base text-on-surface-variant mb-6">{error}</p>
          <Button variant="primary" onClick={() => router.push('/scan/new')}>
            Start New Scan
          </Button>
        </div>
      </AppShell>
    );
  }

  const imageUrl = signedUrl || image?.public_url || '';

  return (
    <AppShell pageTitle="OCR Extraction & Identification">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-display-lg-mobile md:text-display-lg font-display-lg-mobile md:font-display-lg text-on-surface mb-2">
          OCR Extraction & Identification
        </h2>
        <p className="text-body-base font-body-base text-on-surface-variant">
          Review raw text extraction and entity mapping from the product label.
        </p>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Left Column: Product Label Image with Bounding Boxes */}
        <div className="bg-surface border border-outline-variant rounded-lg p-4 md:p-5 shadow-xs flex flex-col h-full">
          <div className="flex justify-between items-center border-b border-outline-variant pb-3 mb-4">
            <h3 className="text-headline-md font-headline-md text-on-surface">
              Label Scan
            </h3>
            <span className="text-xs text-on-surface-variant bg-surface-container-highest px-2.5 py-1 rounded-full font-mono">
              {entities.length} Entities Extracted
            </span>
          </div>

          <div className="relative flex-1 bg-surface-container-low rounded border border-outline-variant overflow-hidden min-h-[420px] flex items-center justify-center">
            {/* Label Image */}
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Product label scan"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-6xl mb-2">image_not_supported</span>
                <p>No image available</p>
              </div>
            )}

            {/* Overlay Bounding Boxes - derived from real OCR word regions */}
            {entities.length > 0 && (
              <div className="absolute inset-0">
                {entities.map((entity, index) => {
                  const box = regionBoxFor(entity.extractedValue);
                  if (!box) return null;
                  const colors = ['bg-primary', 'bg-teal-500', 'bg-indigo-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-red-500'];
                  const color = colors[index % colors.length];
                  const isActive = activeBoundingBoxId === entity.id;

                  return (
                    <div
                      key={entity.id}
                      onMouseEnter={() => setActiveBoundingBoxId(entity.id)}
                      onMouseLeave={() => setActiveBoundingBoxId(null)}
                      className={`absolute border-2 rounded flex items-start justify-start cursor-pointer transition-all group ${
                        color.replace('bg-', 'border-')} ${isActive ? `${color}/40 scale-[1.02] shadow-md` : `${color}/20 hover:${color}/30`}`}
                      style={{
                        left: `${box.left * 100}%`,
                        top: `${box.top * 100}%`,
                        width: `${box.width * 100}%`,
                        height: `${box.height * 100}%`,
                      }}
                    >
                      <div className={`${color} text-white text-[10px] font-label-bold px-1.5 py-0.5 absolute -top-5 left-0 rounded-t shadow-xs whitespace-nowrap`}>
                        {entity.name} - {Math.round(entity.confidence)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Extracted Data Table */}
        <div className="bg-surface border border-outline-variant rounded-lg shadow-xs flex flex-col h-full overflow-hidden">
          <div className="p-4 md:p-5 border-b border-outline-variant bg-surface-container-lowest flex justify-between items-center">
            <h3 className="text-headline-md font-headline-md text-on-surface">
              Extracted Entities
            </h3>
            <span className="text-xs text-on-surface-variant">
              Hover entity to inspect bounding box
            </span>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-bright border-b border-outline-variant">
                  <th className="p-3.5 text-label-bold font-label-bold text-on-surface-variant uppercase tracking-wider text-xs">
                    Entity
                  </th>
                  <th className="p-3.5 text-label-bold font-label-bold text-on-surface-variant uppercase tracking-wider text-xs">
                    Extracted Value
                  </th>
                  <th className="p-3.5 text-label-bold font-label-bold text-on-surface-variant uppercase tracking-wider text-right text-xs">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody className="text-data-tabular font-data-tabular text-on-surface divide-y divide-outline-variant/60 bg-surface">
                {entities.map((item) => (
                  <tr
                    key={item.id}
                    onMouseEnter={() => handleEntityHover(item.id)}
                    onMouseLeave={() => setActiveBoundingBoxId(null)}
                    className="hover:bg-surface-container-low transition-colors cursor-pointer group"
                  >
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${item.colorDot} group-hover:scale-125 transition-transform`} />
                        <span className="font-semibold text-xs text-on-surface">{item.name}</span>
                      </div>
                    </td>
                    <td className="p-3.5 font-medium text-xs text-on-surface">{item.extractedValue}</td>
                    <td className="p-3.5 text-right">
                      <ConfidenceBadge confidence={item.confidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Raw OCR Text Section */}
      {ocrText && (
        <div className="bg-surface border border-outline-variant rounded-lg p-4 mb-6">
          <h3 className="text-label-bold font-label-bold text-on-surface uppercase tracking-wider text-xs mb-2">Raw OCR Text</h3>
          <pre className="bg-surface-container-lowest p-3 rounded text-xs font-mono text-on-surface-variant overflow-x-auto max-h-40">{ocrText}</pre>
        </div>
      )}

      {/* Action Navigation Footer */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4 border-t border-outline-variant">
        <Button
          variant="outline"
          icon="arrow_back"
          onClick={() => router.push('/scan/new')}
        >
          Back to Scan
        </Button>
        <Button
          variant="primary"
          icon="arrow_forward"
          iconPosition="right"
          onClick={() => router.push(`/scan/declarations?inspection=${inspectionId}`)}
          className="px-6"
        >
          Review Declarations
        </Button>
      </div>
    </AppShell>
  );
}