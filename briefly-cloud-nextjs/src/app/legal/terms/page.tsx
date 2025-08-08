/**
 * Terms of Service Page
 * 
 * Updated for the unified Next.js architecture
 */

import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service - Briefly Cloud',
  description: 'Terms of Service for Briefly Cloud AI-powered productivity assistant',
};

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
            <p className="text-gray-600">
              Last updated: {new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </header>

          <div className="prose prose-lg max-w-none">
            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Acceptance of Terms</h2>
              <p className="text-gray-700 mb-4">
                By accessing and using Briefly Cloud ("Service"), you accept and agree to be bound by the terms 
                and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
              </p>
              <p className="text-gray-700">
                These Terms of Service ("Terms") govern your use of our AI-powered productivity assistant service 
                operated by RekonnLabs ("us", "we", or "our").
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Description of Service</h2>
              <p className="text-gray-700 mb-4">
                Briefly Cloud is an AI-powered productivity assistant that allows users to:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li>Upload and process documents in various formats (PDF, DOCX, TXT, MD, CSV, XLSX, PPTX)</li>
                <li>Chat with AI about document content using advanced language models</li>
                <li>Connect cloud storage accounts (Google Drive, OneDrive) for document access</li>
                <li>Manage subscriptions and usage limits based on service tiers</li>
                <li>Access vector search and semantic document analysis</li>
              </ul>
              <p className="text-gray-700">
                The service is provided through a unified Next.js web application deployed on Vercel, 
                with data storage managed through Supabase and AI capabilities powered by OpenAI.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. User Accounts and Registration</h2>
              <p className="text-gray-700 mb-4">
                To access certain features of the Service, you must register for an account. You may register 
                using OAuth authentication through Google or Microsoft accounts.
              </p>
              <p className="text-gray-700 mb-4">
                You are responsible for:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li>Maintaining the confidentiality of your account credentials</li>
                <li>All activities that occur under your account</li>
                <li>Notifying us immediately of any unauthorized use of your account</li>
                <li>Ensuring the accuracy of information provided during registration</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Subscription Tiers and Billing</h2>
              <p className="text-gray-700 mb-4">
                Briefly Cloud offers multiple subscription tiers:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li><strong>Free Tier:</strong> Limited usage with basic features</li>
                <li><strong>Pro Tier:</strong> Enhanced features and higher usage limits</li>
                <li><strong>Pro BYOK (Bring Your Own Key):</strong> Use your own OpenAI API key with advanced features</li>
              </ul>
              <p className="text-gray-700 mb-4">
                Billing is processed through Stripe. Subscription fees are charged in advance on a monthly or annual basis. 
                You may cancel your subscription at any time through your account settings.
              </p>
              <p className="text-gray-700">
                Usage limits are enforced based on your subscription tier. Exceeding limits may result in 
                temporary service restrictions until the next billing cycle or upgrade.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Acceptable Use Policy</h2>
              <p className="text-gray-700 mb-4">
                You agree not to use the Service to:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li>Upload or process illegal, harmful, or inappropriate content</li>
                <li>Violate any applicable laws or regulations</li>
                <li>Infringe upon intellectual property rights of others</li>
                <li>Attempt to reverse engineer, hack, or compromise the Service</li>
                <li>Share account credentials or allow unauthorized access</li>
                <li>Use the Service for commercial purposes beyond your subscription tier</li>
                <li>Upload malware, viruses, or other malicious code</li>
                <li>Spam or send unsolicited communications through the Service</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Data Processing and Privacy</h2>
              <p className="text-gray-700 mb-4">
                Your privacy is important to us. Our data processing practices are governed by our Privacy Policy, 
                which is incorporated into these Terms by reference.
              </p>
              <p className="text-gray-700 mb-4">
                Key points regarding data processing:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li>Documents are processed using AI services (OpenAI) for analysis and chat functionality</li>
                <li>Document content is stored securely in our database and vector storage systems</li>
                <li>We implement appropriate technical and organizational measures to protect your data</li>
                <li>You retain ownership of your uploaded documents and generated content</li>
                <li>We comply with GDPR and other applicable data protection regulations</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Intellectual Property Rights</h2>
              <p className="text-gray-700 mb-4">
                The Service and its original content, features, and functionality are and will remain the 
                exclusive property of RekonnLabs and its licensors. The Service is protected by copyright, 
                trademark, and other laws.
              </p>
              <p className="text-gray-700 mb-4">
                You retain all rights to content you upload to the Service. By uploading content, you grant 
                us a limited license to process, store, and analyze your content solely for the purpose of 
                providing the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Service Availability and Modifications</h2>
              <p className="text-gray-700 mb-4">
                We strive to maintain high service availability but cannot guarantee uninterrupted access. 
                The Service may be temporarily unavailable due to:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li>Scheduled maintenance</li>
                <li>Technical issues or outages</li>
                <li>Third-party service dependencies (OpenAI, Supabase, Vercel)</li>
                <li>Force majeure events</li>
              </ul>
              <p className="text-gray-700">
                We reserve the right to modify, suspend, or discontinue the Service at any time with reasonable notice.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Limitation of Liability</h2>
              <p className="text-gray-700 mb-4">
                To the maximum extent permitted by applicable law, RekonnLabs shall not be liable for any 
                indirect, incidental, special, consequential, or punitive damages, or any loss of profits 
                or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, 
                or other intangible losses.
              </p>
              <p className="text-gray-700">
                Our total liability to you for all damages shall not exceed the amount paid by you to us 
                in the twelve (12) months preceding the event giving rise to the claim.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Indemnification</h2>
              <p className="text-gray-700">
                You agree to defend, indemnify, and hold harmless RekonnLabs and its affiliates, officers, 
                directors, employees, and agents from and against any claims, damages, obligations, losses, 
                liabilities, costs, or debt, and expenses (including attorney's fees) arising from your use 
                of the Service or violation of these Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Termination</h2>
              <p className="text-gray-700 mb-4">
                We may terminate or suspend your account and access to the Service immediately, without prior 
                notice or liability, for any reason, including breach of these Terms.
              </p>
              <p className="text-gray-700 mb-4">
                You may terminate your account at any time by:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li>Canceling your subscription through account settings</li>
                <li>Requesting account deletion through our GDPR compliance tools</li>
                <li>Contacting our support team</li>
              </ul>
              <p className="text-gray-700">
                Upon termination, your right to use the Service will cease immediately, and we may delete 
                your account and data in accordance with our data retention policies.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Governing Law and Dispute Resolution</h2>
              <p className="text-gray-700 mb-4">
                These Terms shall be governed by and construed in accordance with the laws of [Your Jurisdiction], 
                without regard to its conflict of law provisions.
              </p>
              <p className="text-gray-700">
                Any disputes arising from these Terms or your use of the Service shall be resolved through 
                binding arbitration in accordance with the rules of [Arbitration Organization].
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. Changes to Terms</h2>
              <p className="text-gray-700 mb-4">
                We reserve the right to modify these Terms at any time. We will notify users of material 
                changes through:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li>Email notification to registered users</li>
                <li>In-app notifications</li>
                <li>Updates to this page with revised effective date</li>
              </ul>
              <p className="text-gray-700">
                Your continued use of the Service after changes become effective constitutes acceptance of the new Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">14. Contact Information</h2>
              <p className="text-gray-700 mb-4">
                If you have any questions about these Terms of Service, please contact us:
              </p>
              <ul className="list-none text-gray-700">
                <li><strong>Email:</strong> legal@rekonnlabs.com</li>
                <li><strong>Support:</strong> support@rekonnlabs.com</li>
                <li><strong>Address:</strong> [Your Business Address]</li>
              </ul>
            </section>
          </div>

          <footer className="mt-12 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              These Terms of Service are effective as of the date last updated above and supersede all prior versions.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}