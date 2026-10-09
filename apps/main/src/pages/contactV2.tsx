import { ArrowRight, CheckCircle2, ClipboardList, Mail, MapPin, MessageSquareText, Phone } from "lucide-react";
import { showNotification } from "@whitepoint/ui/layout";
import { createApiClient, resolveApiBaseUrl } from "@whitepoint/utils";
import { useState } from "react";
import { MarketingButton, MarketingSelect, MarketingTextarea, MarketingTextField } from "../components/marketing";
import { coreCountyNames } from "../data/serviceCounties";

type PreferredMethod = "Email" | "Phone" | "Text message";
type FieldErrors = Partial<Record<"firstName" | "lastName" | "email" | "phone" | "subject" | "message", string>>;

const quoteDetails = [
  "Property address or parcel details",
  "Survey type or what the survey is for",
  "Closing, permit, or construction deadline",
  "Any title, site plan, or county requirements you already have",
];

export function ContactV2() {
  return (
    <div className="bg-white text-gray-900">
      <section className="border-b border-gray-200 bg-gray-50">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[0.95fr_1.05fr] md:py-14 lg:px-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-primary">Contact White Point</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight text-gray-900 sm:text-5xl">Request a survey quote or project fit check</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-gray-600">
              Send the basics and we will help identify the right survey path for your property,
              construction, flood, closing, or development need.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <ContactLink icon={Phone} label="Call" value="(407) 710-1980" href="tel:14077101980" />
              <ContactLink icon={Mail} label="Email" value="info@whitepointsurvey.com" href="mailto:info@whitepointsurvey.com" />
            </div>
          </div>

          <aside className="border-l-4 border-primary bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center bg-primary text-white">
                <ClipboardList className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="text-2xl font-bold text-gray-900">Helpful quote details</h2>
            </div>
            <ul className="mt-5 grid gap-3">
              {quoteDetails.map((detail) => (
                <li key={detail} className="flex gap-3 text-sm leading-6 text-gray-700">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={2.5} aria-hidden="true" />
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 border-t border-gray-200 pt-5">
              <div className="flex gap-3 text-sm leading-6 text-gray-700">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={2.5} aria-hidden="true" />
                <p>Core coverage includes {coreCountyNames.slice(0, 6).join(", ")}, and nearby Central Florida counties.</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[0.7fr_1.3fr] lg:px-8">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-primary">Send a message</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">Tell us what you are working on</h2>
          <p className="mt-4 text-base leading-7 text-gray-600">
            A short, specific message is enough to start. If you are unsure which survey you need,
            describe the goal and any deadline attached to it.
          </p>
          <div className="mt-6 grid gap-4">
            <InfoCard
              icon={MessageSquareText}
              title="Best first message"
              description="Include the property address, project type, preferred contact method, and any urgency."
            />
            <InfoCard
              icon={ArrowRight}
              title="Next step"
              description="White Point will review the details and follow up through your preferred contact method."
            />
          </div>
        </div>
        <ContactFormV2 />
      </section>
    </div>
  );
}

function ContactLink({ icon: Icon, label, value, href }: { icon: typeof Phone; label: string; value: string; href: string }) {
  return (
    <a href={href} className="flex items-center gap-3 border border-gray-200 bg-white p-4 shadow-sm transition hover:border-primary-200 hover:shadow-md">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-primary text-white">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-xs font-bold uppercase tracking-wide text-gray-500">{label}</span>
        <span className="block text-sm font-bold text-gray-900">{value}</span>
      </span>
    </a>
  );
}

function InfoCard({ icon: Icon, title, description }: { icon: typeof MessageSquareText; title: string; description: string }) {
  return (
    <article className="border border-gray-200 bg-gray-50 p-5">
      <Icon className="h-6 w-6 text-primary" strokeWidth={2.5} aria-hidden="true" />
      <h3 className="mt-3 text-lg font-bold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
    </article>
  );
}

function ContactFormV2() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [preferredMethod, setPreferredMethod] = useState<PreferredMethod>("Email");
  const [submissionStatus, setSubmissionStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const validateFields = (): boolean => {
    const nextErrors: FieldErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}$/;

    if (!firstName.trim()) nextErrors.firstName = "First name is required.";
    if (!lastName.trim()) nextErrors.lastName = "Last name is required.";
    if (!email.trim()) nextErrors.email = "Email is required.";
    else if (!emailRegex.test(email)) nextErrors.email = "Please enter a valid email address.";
    if (!phone.trim()) nextErrors.phone = "Phone number is required.";
    else if (!phoneRegex.test(phone)) nextErrors.phone = "Please enter a valid phone number.";
    if (!subject.trim()) nextErrors.subject = "Subject is required.";
    if (message.trim().length < 10) nextErrors.message = "Message must be at least 10 characters long.";

    setFieldErrors(nextErrors);
    setSubmissionStatus(Object.keys(nextErrors).length ? "error" : "submitting");
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateFields()) return;
    setSubmissionStatus("submitting");

    try {
      const api = createApiClient({ baseUrl: resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL, window.location.hostname) });
      await api.requestJson('/public/contact', {
        authMode: 'public', method: 'POST',
        body: JSON.stringify({ firstName, lastName, email, phone, preferredMethod, subject, message }),
      });
      setSubmissionStatus("success");
      showNotification({
        title: "Message Sent!",
        body: "Thank you for reaching out. We'll get back to you as soon as possible.",
        style: "success",
      });
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setSubject("");
      setMessage("");
      setPreferredMethod("Email");
      setFieldErrors({});
    } catch (error) {
      showNotification({ title: "Error", body: error instanceof Error ? error.message : "Failed to send message. Please try again later.", style: "danger" });
      setSubmissionStatus("error");
    }
  };

  return (
    <div className="border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <MarketingTextField
          field="firstName"
          label="First Name"
          placeholder="John"
          value={firstName}
          autoComplete="given-name"
          error={fieldErrors.firstName}
          onChange={(event) => setFirstName(event.target.value)}
        />
        <MarketingTextField
          field="lastName"
          label="Last Name"
          placeholder="Doe"
          value={lastName}
          autoComplete="family-name"
          error={fieldErrors.lastName}
          onChange={(event) => setLastName(event.target.value)}
        />
        <MarketingTextField
          field="email"
          label="Email Address"
          placeholder="john.doe@example.com"
          type="email"
          value={email}
          autoComplete="email"
          error={fieldErrors.email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <MarketingTextField
          field="phone"
          label="Phone Number"
          placeholder="123-456-7890"
          type="tel"
          value={phone}
          autoComplete="tel"
          error={fieldErrors.phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        <MarketingSelect
          field="preferredMethod"
          label="Preferred Contact Method"
          value={preferredMethod}
          options={[{ label: "Email", value: "Email" }, { label: "Phone", value: "Phone" }, { label: "Text message", value: "Text message" }]}
          onChange={(event) => setPreferredMethod(event.target.value as PreferredMethod)}
        />
        <MarketingTextField
          field="subject"
          label="Subject"
          placeholder="Boundary survey quote"
          value={subject}
          error={fieldErrors.subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        <MarketingTextarea
          className="md:col-span-2"
          field="message"
          label="Project Details"
          placeholder="Property address, survey need, deadline, and any details you already have..."
          value={message}
          error={fieldErrors.message}
          onChange={(event) => setMessage(event.target.value)}
        />
        {submissionStatus === "success" ? (
          <p className="border-l-4 border-primary bg-primary-50 p-3 text-sm font-semibold text-gray-800 md:col-span-2">
            Message sent. Thank you for reaching out.
          </p>
        ) : null}
        <div className="md:col-span-2">
          <MarketingButton
            label={submissionStatus === "submitting" ? "Submitting Form..." : "Submit Request"}
            variant={submissionStatus === "submitting" ? "secondary" : "primary"}
            onClick={handleSubmit}
            disabled={submissionStatus === "submitting"}
            icon={ArrowRight}
            className="w-full sm:w-auto"
          />
        </div>
      </div>
    </div>
  );
}
