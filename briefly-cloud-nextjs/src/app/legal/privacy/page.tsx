/**
 * Privacy Policy Page
 * 
 * Updated for the unified Next.js architecture and GDPR compliance
 */

import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy - Briefly Cloud',
  description: 'Privacy Policy for Briefly Cloud AI-powered productivity assistant',
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
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
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
              <p className="text-gray-700 mb-4">
                RekonnLabs ("we", "our", or "us") operates Briefly Cloud, an AI-powered productivity assistant. 
                This Privacy Policy explains how we collect, use, disclose, and safeguard your information when 
                you use our service.
              </p>
              <p className="text-gray-700">
                We are committed to protecting your privacy and ensuring transparency about our data practices. 
                This policy complies with the General Data Protection Regulation (GDPR), California Consumer 
                Privacy Act (CCPA), and other applicable privacy laws.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Information We Collect</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mb-3">2.1 Information You Provide</h3>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li><strong>Account Information:</strong> Email address, name, and profile information from OAuth providers (Google, Microsoft)</li>
                <li><strong>Document Content:</strong> Files you upload in various formats (PDF, DOCX, TXT, MD, CSV, XLSX, PPTX)</li>
                <li><strong>Chat Messages:</strong> Your questions and interactions with our AI assistant</li>
                <li><strong>Cloud Storage Access:</strong> Files you choose to process from connected Google Drive or OneDrive accounts</li>
                <li><strong>Payment Information:</strong> Billing details processed through Stripe (we do not store credit card information)</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">2.2 Information Automatically Collected</h3>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li><strong>Usage Data:</strong> How you interact with our service, features used, and performance metrics</li>
                <li><strong>Technical Information:</strong> IP address, browser type, device information, and operating system</li>
                <li><strong>Log Data:</strong> Server logs, error reports, and security events</li>
                <li><strong>Analytics Data:</strong> Aggregated usage statistics and performance metrics (with your consent)</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">2.3 Information from Third Parties</h3>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li><strong>OAuth Providers:</strong> Basic profile information from Google and Microsoft when you authenticate</li>
                <li><strong>Cloud Storage:</strong> Metadata and content from files you choose to process from connected accounts</li>
                <li><strong>Payment Processor:</strong> Transaction information from Stripe for billing purposes</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. How We Use Your Information</h2>
              <p className="text-gray-700 mb-4">
                We use your information for the following purposes:
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">3.1 Service Provision (Legal Basis: Contract Performance)</h3>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li>Process and analyze your documents using AI technology</li>
                <li>Provide chat functionality and AI-powered responses</li>
                <li>Store and retrieve your documents and conversation history</li>
                <li>Manage your account and subscription</li>
                <li>Process payments and billing</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">3.2 Service Improvement (Legal Basis: Legitimate Interest)</h3>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li>Analyze usage patterns to improve our service</li>
                <li>Develop new features and functionality</li>
                <li>Optimize performance and user experience</li>
                <li>Conduct security monitoring and fraud prevention</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">3.3 Communication (Legal Basis: Consent/Legitimate Interest)</h3>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li>Send service-related notifications and updates</li>
                <li>Provide customer support</li>
                <li>Send marketing communications (with your consent)</li>
                <li>Notify you of important changes to our service or policies</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">3.4 Legal Compliance (Legal Basis: Legal Obligation)</h3>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li>Comply with applicable laws and regulations</li>
                <li>Respond to legal requests and court orders</li>
                <li>Protect our rights and the rights of our users</li>
                <li>Prevent fraud and abuse</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Data Sharing and Disclosure</h2>
              <p className="text-gray-700 mb-4">
                We do not sell your personal information. We may share your information in the following circumstances:
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">4.1 Service Providers</h3>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li><strong>OpenAI:</strong> Document content and chat messages for AI processing</li>
                <li><strong>Supabase:</strong> Data storage and database management</li>
                <li><strong>Vercel:</strong> Application hosting and deployment</li>
                <li><strong>Stripe:</strong> Payment processing</li>
                <li><strong>ChromaDB:</strong> Vector storage for semantic search</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">4.2 Legal Requirements</h3>
              <p className="text-gray-700 mb-4">
                We may disclose your information if required by law, court order, or government request, 
                or to protect our rights, property, or safety, or that of our users or the public.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">4.3 Business Transfers</h3>
              <p className="text-gray-700 mb-4">
                In the event of a merger, acquisition, or sale of assets, your information may be transferred 
                to the acquiring entity, subject to the same privacy protections.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Data Security</h2>
              <p className="text-gray-700 mb-4">
                We implement appropriate technical and organizational measures to protect your information:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li><strong>Encryption:</strong> Data is encrypted in transit (TLS) and at rest</li>
                <li><strong>Access Controls:</strong> Strict access controls and authentication requirements</li>
                <li><strong>Regular Audits:</strong> Security assessments and vulnerability testing</li>
                <li><strong>Monitoring:</strong> Continuous monitoring for security threats</li>
                <li><strong>Incident Response:</strong> Procedures for handling security incidents</li>
              </ul>
              <p className="text-gray-700">
                While we strive to protect your information, no method of transmission over the internet 
                or electronic storage is 100% secure. We cannot guarantee absolute security.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Data Retention</h2>
              <p className="text-gray-700 mb-4">
                We retain your information for as long as necessary to provide our services and comply with legal obligations:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li><strong>Account Data:</strong> Retained while your account is active and for 3 years after deletion</li>
                <li><strong>Document Content:</strong> Retained while your account is active and for 3 years after deletion</li>
                <li><strong>Chat History:</strong> Retained for 7 years for legal compliance</li>
                <li><strong>Usage Logs:</strong> Retained for 2 years for security and analytics purposes</li>
                <li><strong>Payment Records:</strong> Retained for 7 years for tax and legal compliance</li>
              </ul>
              <p className="text-gray-700">
                You can request deletion of your data at any time through our GDPR compliance tools.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Your Privacy Rights</h2>
              <p className="text-gray-700 mb-4">
                Depending on your location, you may have the following rights regarding your personal information:
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">7.1 GDPR Rights (EU Residents)</h3>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li><strong>Right of Access:</strong> Request a copy of your personal data</li>
                <li><strong>Right to Rectification:</strong> Correct inaccurate or incomplete data</li>
                <li><strong>Right to Erasure:</strong> Request deletion of your personal data</li>
                <li><strong>Right to Restrict Processing:</strong> Limit how we use your data</li>
                <li><strong>Right to Data Portability:</strong> Receive your data in a portable format</li>
                <li><strong>Right to Object:</strong> Object to processing based on legitimate interests</li>
                <li><strong>Right to Withdraw Consent:</strong> Withdraw consent for data processing</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">7.2 CCPA Rights (California Residents)</h3>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li><strong>Right to Know:</strong> Information about data collection and use</li>
                <li><strong>Right to Delete:</strong> Request deletion of personal information</li>
                <li><strong>Right to Opt-Out:</strong> Opt-out of the sale of personal information (we don't sell data)</li>
                <li><strong>Right to Non-Discrimination:</strong> Equal service regardless of privacy choices</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">7.3 Exercising Your Rights</h3>
              <p className="text-gray-700 mb-4">
                To exercise your privacy rights:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li>Use our GDPR compliance tools in your account settings</li>
                <li>Contact us at privacy@rekonnlabs.com</li>
                <li>Submit a request through our support system</li>
              </ul>
              <p className="text-gray-700">
                We will respond to your request within 30 days (or as required by applicable law).
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Cookies and Tracking</h2>
              <p className="text-gray-700 mb-4">
                We use cookies and similar technologies to provide and improve our service:
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">8.1 Essential Cookies</h3>
              <p className="text-gray-700 mb-4">
                Required for basic functionality, authentication, and security. These cannot be disabled.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">8.2 Analytics Cookies</h3>
              <p className="text-gray-700 mb-4">
                Help us understand how users interact with our service (requires consent).
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">8.3 Functional Cookies</h3>
              <p className="text-gray-700 mb-4">
                Enable enhanced features like chat history and personalized settings (requires consent).
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">8.4 Marketing Cookies</h3>
              <p className="text-gray-700 mb-4">
                Used for advertising and marketing purposes (requires consent).
              </p>

              <p className="text-gray-700">
                You can manage your cookie preferences through our consent management system.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. International Data Transfers</h2>
              <p className="text-gray-700 mb-4">
                Your information may be transferred to and processed in countries other than your own. 
                We ensure appropriate safeguards are in place:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li>Standard Contractual Clauses (SCCs) with service providers</li>
                <li>Adequacy decisions by relevant data protection authorities</li>
                <li>Certification schemes and codes of conduct</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Children's Privacy</h2>
              <p className="text-gray-700">
                Our service is not intended for children under 13 years of age. We do not knowingly collect 
                personal information from children under 13. If you become aware that a child has provided 
                us with personal information, please contact us, and we will take steps to remove such information.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Changes to This Privacy Policy</h2>
              <p className="text-gray-700 mb-4">
                We may update this Privacy Policy from time to time. We will notify you of any material changes by:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li>Email notification to registered users</li>
                <li>Prominent notice on our website</li>
                <li>In-app notifications</li>
              </ul>
              <p className="text-gray-700">
                Your continued use of the service after changes become effective constitutes acceptance of the updated policy.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Contact Information</h2>
              <p className="text-gray-700 mb-4">
                If you have any questions about this Privacy Policy or our data practices, please contact us:
              </p>
              <ul className="list-none text-gray-700 mb-4">
                <li><strong>Privacy Officer:</strong> privacy@rekonnlabs.com</li>
                <li><strong>General Support:</strong> support@rekonnlabs.com</li>
                <li><strong>Data Protection Officer:</strong> dpo@rekonnlabs.com</li>
                <li><strong>Address:</strong> [Your Business Address]</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">12.1 EU Representative</h3>
              <p className="text-gray-700 mb-4">
                If you are in the European Union, you can also contact our EU representative:
              </p>
              <ul className="list-none text-gray-700">
                <li><strong>EU Representative:</strong> [EU Representative Name]</li>
                <li><strong>Address:</strong> [EU Representative Address]</li>
                <li><strong>Email:</strong> eu-representative@rekonnlabs.com</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. Supervisory Authority</h2>
              <p className="text-gray-700">
                If you are in the European Union and believe we have not addressed your privacy concerns, 
                you have the right to lodge a complaint with your local data protection supervisory authority.
              </p>
            </section>
          </div>

          <footer className="mt-12 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              This Privacy Policy is effective as of the date last updated above and supersedes all prior versions.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}