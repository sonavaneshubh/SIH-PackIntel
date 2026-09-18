import type { Metadata } from 'next';
import { EvaluationDemo } from '@/features/evaluation/EvaluationDemo';

export const metadata: Metadata = {
  title: 'SIH Evaluation Demo | PackIntel',
  description:
    'Read-only PackIntel evaluation experience with sample data — full main-inspector access to the complete workflow, no personal account required.',
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return <EvaluationDemo />;
}