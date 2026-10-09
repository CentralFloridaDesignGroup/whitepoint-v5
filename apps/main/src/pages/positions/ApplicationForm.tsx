import { useState, type FormEvent } from 'react';
import type { JobPosition } from './jobPosition';
import { createApiClient, resolveApiBaseUrl } from '@whitepoint/utils';
import { MarketingButton, MarketingTextField, MarketingTextarea } from '../../components/marketing';

const MAX_FILE_SIZE = 3 * 1024 * 1024;

export function ApplicationForm({ position }: { position: JobPosition }) {
    const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (status === 'submitting') return;

        const form = event.currentTarget;
        const formData = new FormData(form);
        const resume = formData.get('resume');
        const coverLetter = formData.get('coverLetter');
        if (!(resume instanceof File) || resume.size === 0 || resume.size > MAX_FILE_SIZE ||
            (coverLetter instanceof File && coverLetter.size > MAX_FILE_SIZE)) {
            setStatus('error');
            setMessage('Please attach a résumé of 3 MB or less. An optional cover letter must also be 3 MB or less.');
            return;
        }

        formData.set('positionId', position.id);
        setStatus('submitting');
        setMessage('');
        try {
            const api = createApiClient({ baseUrl: resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL, window.location.hostname) });
            await api.requestJson('/public/job-applications', { authMode: 'public', method: 'POST', body: formData });
            form.reset();
            setStatus('success');
            setMessage('Application sent. Thank you for your interest.');
        } catch (error) {
            setStatus('error');
            setMessage(error instanceof Error ? error.message : 'Your application could not be sent. Please try again.');
        }
    }

    return (
        <section id="apply" className="mt-10 border border-primary p-5 sm:p-8">
            <h3 className="text-2xl font-semibold text-primary">Apply for this position</h3>
            <p className="mt-2 text-gray-700">Complete the form and attach your résumé. A cover letter is optional. PDF, DOC, and DOCX files up to 3 MB each are accepted.</p>
            <form className="mt-6 grid gap-5 md:grid-cols-2" onSubmit={submit}>
                <MarketingTextField field="applicantName" label="Full name" required maxLength={120} />
                <MarketingTextField field="applicantEmail" label="Email address" type="email" required maxLength={254} />
                <MarketingTextField field="applicantPhone" label="Phone number" type="tel" maxLength={40} />
                <MarketingTextarea field="applicantMessage" label="Anything else you would like us to know?" maxLength={2000} className="md:col-span-2" />
                <div>
                    <label htmlFor="resume" className="block text-sm font-semibold text-gray-900">Résumé (required)</label>
                    <input id="resume" name="resume" type="file" accept=".pdf,.doc,.docx" required className="mt-2 block w-full border border-gray-300 bg-white p-3 text-gray-900" />
                </div>
                <div>
                    <label htmlFor="coverLetter" className="block text-sm font-semibold text-gray-900">Cover letter (optional)</label>
                    <input id="coverLetter" name="coverLetter" type="file" accept=".pdf,.doc,.docx" className="mt-2 block w-full border border-gray-300 bg-white p-3 text-gray-900" />
                </div>
                <div className="hidden" aria-hidden="true">
                    <label htmlFor="website">Website</label>
                    <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
                </div>
                <div className="md:col-span-2">
                    <MarketingButton type="submit" label={status === 'submitting' ? 'Sending application...' : 'Submit application'} disabled={status === 'submitting'} />
                    {message && <p role="status" className={`mt-3 ${status === 'error' ? 'text-red-700' : 'text-green-700'}`}>{message}</p>}
                </div>
            </form>
        </section>
    );
}
