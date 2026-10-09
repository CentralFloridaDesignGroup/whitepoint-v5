import { MarketingButton } from '../../components/marketing';
import { showNotification } from '@whitepoint/ui/layout';
import { Dates } from "@whitepoint/utils";
import type { JobPosition } from './jobPosition';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApplicationForm } from './ApplicationForm';

export function JobDetail() {
    const { id } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [position, setPosition] = useState<JobPosition | null>(null);

    useEffect(() => {
        async function fetchPositions() {
            try {
                if (!id) {
                    setError("Invalid job ID");
                    setLoading(false);
                    return;
                }

                const response = await fetch("/positions/index.json");
                if (!response.ok) {
                    setError(`Error fetching job positions: ${response.statusText}`);
                    setLoading(false);
                    return;
                }
                const positionFiles = await response.json() as string[];
                let resolvedPosition: JobPosition | null = null;

                for (const positionFile of positionFiles) {
                    const positionResponse = await fetch(`/positions/${positionFile}`);
                    if (!positionResponse.ok) {
                        continue;
                    }

                    const fileData = await positionResponse.json() as unknown;
                    let candidatePosition: JobPosition | null = null;

                    if (fileData && typeof fileData === "object" && "jobData" in fileData) {
                        candidatePosition = (fileData as { jobData: JobPosition }).jobData;
                    } else if (fileData && typeof fileData === "object") {
                        candidatePosition = fileData as JobPosition;
                    }

                    if (candidatePosition && candidatePosition.id === id) {
                        resolvedPosition = candidatePosition;
                        break;
                    }
                }

                if (!resolvedPosition) {
                    setError("Position not found");
                    return;
                }

                if (!resolvedPosition.isActive) {
                    setError("This position is no longer active.");
                    return;
                }

                if (Dates.getDaysRemaining(resolvedPosition.basicInfo.positionEndDate) < 0) {
                    setError("This position is no longer active.");
                    return;
                }

                if (!resolvedPosition.basicInfo || !resolvedPosition.displayName) {
                    setError("Position data is malformed.");
                    return;
                }

                setPosition(resolvedPosition);
            }
            catch (error) {
                console.error("Failed to fetch job positions:", error);
                setError("Failed to fetch job positions");
            }
            finally {
                setLoading(false);
            }
        }
        fetchPositions();
    }, []);

    if (loading) {
        return (
            <div className='max-w-7xl mx-auto px-4 py-6'>
                <p>Loading...</p>
            </div>
        );
    }

    if (!position || error) {
        return (
            <div className='max-w-7xl mx-auto px-4 py-6'>
                <h1 className='text-2xl font-bold text-center'>Job Detail Page</h1>
                <p>Error: {error}</p>
            </div>
        );
    }

    return (
        <div className='max-w-7xl mx-auto px-4 py-6'>
            <div className='flex flex-row items-center mb-4'>
                <a href="/positions" className='flex items-center text-primary hover:underline'>
                    <ChevronLeft className='w-6 h-6' />
                </a>
                <div className='flex-1'>
                    <h1 className='text-2xl font-bold text-center'>Job Detail Page</h1>
                    <h2 className='text-xl font-semibold text-center'>{position.displayName}</h2>
                </div>
            </div>
            <div className='mt-4 grid grid-cols-1 gap-2 md:grid-cols-4'>
                <p><strong>Department:</strong> {position.basicInfo.department}</p>
                <p><strong>Location:</strong> {position.basicInfo.positionCity}, {position.basicInfo.positionState}</p>
                <p><strong>Position Type:</strong> {position.basicInfo.positionType}</p>
                <p><strong>Salary:</strong> {position.basicInfo.startingSalary ? `$${position.basicInfo.startingSalary.toLocaleString()}` : "N/A"}{position.basicInfo.endingSalary && position.basicInfo.endingSalary !== position.basicInfo.startingSalary ? ` - $${position.basicInfo.endingSalary.toLocaleString()}` : ""}</p>
                <p><strong>Salary Type:</strong> {position.basicInfo.positionSalaryType}</p>
                <p><strong>Open Date:</strong> {Dates.formatDate(position.basicInfo.positionOpenDate, "MM/dd/yyyy")}</p>
                <p><strong>End Date:</strong> {position.basicInfo.positionEndDate !== "0" ? Dates.formatDate(position.basicInfo.positionEndDate, "MM/dd/yyyy") : "Open Until Filled"}</p>
                <p><strong>Days Left:</strong> {Dates.getDaysRemaining(position.basicInfo.positionEndDate) === Infinity ? "N/A" : Dates.getDaysRemaining(position.basicInfo.positionEndDate)}</p>
            </div>
            <div className='mt-6'>
                <h3 className='text-lg font-semibold'>Job Description:</h3>
                {position.description.map((paragraph, index) => (
                    <div key={index} className="mt-4">
                        {paragraph.type === "paragraph" && (
                            <p className='mt-2'>{paragraph.content}</p>
                        )}
                        {paragraph.type === "list-bulleted" && (
                            <ul className='list-disc list-inside mt-2 ps-6 -indent-6'>
                                {paragraph.content.split(", ").map((item, itemIndex) => (
                                    <li key={itemIndex}>{item}</li>
                                ))}
                            </ul>
                        )}
                        {paragraph.type === "list-numbered" && (
                            <ol className='list-decimal list-inside mt-2 ps-4 -indent-4'>
                                {paragraph.content.split(", ").map((item, itemIndex) => (
                                    <li key={itemIndex}>{item}</li>
                                ))}
                            </ol>
                        )}
                    </div>
                ))}
            </div>
            <div className='mt-6'>
                <h3 className='text-lg font-semibold'>Benefits:</h3>
                <ul className='list-disc list-inside mt-2 ps-6 -indent-6'>
                    {position.benefits.map((benefit, index) => (
                        <li key={index}>{benefit}</li>
                    ))}
                </ul>
            </div>
            <div className='mt-6'>
                <h3 className='text-lg font-semibold'>Requirements:</h3>
                <ul className='list-disc list-inside mt-2 ps-6 -indent-6'>
                    {position.requirements.map((requirement, index) => (
                        <li key={index}>{requirement}</li>
                    ))}
                </ul>
            </div>
            <div className='mt-6 grid grid-cols-1 gap-2 md:grid-cols-6'>
                <MarketingButton
                    label="Apply Now"
                    variant='primary'
                    onClick={() => document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' })}
                />
                <MarketingButton
                    label="Copy Link"
                    variant='secondary'
                    onClick={() => {
                        const url = `${window.location.origin}/positions/${position.id}`;
                        navigator.clipboard.writeText(url)
                            .then(() => showNotification({ title: "Copied to Clipboard", body: "Link copied to clipboard!", style: "success" }))
                            .catch(() => showNotification({ title: "Error", body: "Failed to copy link. Please try copying manually: " + url, style: "danger" }));
                    }}
                />
                <MarketingButton
                    label="Email Job Posting"
                    variant="secondary"
                    onClick={() => {
                        const url = `${window.location.origin}/positions/${position.id}`;
                        window.location.href = `mailto:?subject=Job Posting: ${position.displayName}&body=Check out this job posting: ${url}`;
                        showNotification({ title: "Email Client Opened", body: "Your email client has been opened to send the job posting.", style: "success" });
                    }}
                />
            </div>
            <ApplicationForm position={position} />
        </div>
    );
}
