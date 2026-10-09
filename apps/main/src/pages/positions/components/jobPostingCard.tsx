import { MarketingButton } from '../../../components/marketing';
import { showNotification } from '@whitepoint/ui/layout';
import { Numbers, Dates } from "@whitepoint/utils";
import type { JobPosition } from '../jobPosition';

export function JobPostingCard({ position }: { position: JobPosition }) {

    function GetSalaryString(): string {
        const { startingSalary, endingSalary } = position.basicInfo;
        if (endingSalary && endingSalary !== startingSalary) {
            return `${Numbers.formatNumber(startingSalary, { style: "currency", currency: "USD" })} - ${Numbers.formatNumber(endingSalary, { style: "currency", currency: "USD" })}`;
        }
        return Numbers.formatNumber(startingSalary, { style: "currency", currency: "USD" });
    }

    function GetDateRangeString(): string {
        const openDate = new Date(position.basicInfo.positionOpenDate);
        const endDate = position.basicInfo.positionEndDate !== "0" ? new Date(position.basicInfo.positionEndDate) : null;
        const openDateString = Dates.formatDate(openDate, "MM.dd.yyyy");
        const endDateString = endDate ? Dates.formatDate(endDate, "MM.dd.yyyy") : "Open Until Filled";
        return `${openDateString}${endDate ? ` - ${endDateString} (${Dates.getDaysRemaining(position.basicInfo.positionEndDate)} days)` : " (Open Until Filled)"}`;
    }

    return (
        <div className="border border-primary p-4 shadow-md">
            <h2 className="text-2xl font-bold mb-2 text-center">{position.displayName}</h2>
            <div className="grid grid-cols-1 gap-2 mb-4 text-sm text-left md:grid-cols-2 md:text-center">
                <p>Department: {position.basicInfo.department}</p>
                <p>Location: {position.basicInfo.positionCity} | {position.basicInfo.positionState}</p>
                <p>Open: {GetDateRangeString()}</p>
                <p>Type: {position.basicInfo.positionType}</p>
                <p>Salary: {GetSalaryString()}</p>
                <p>Salary Type: {position.basicInfo.positionSalaryType}</p>
            </div>
            <p className="text-gray-800 mb-4">{(position.description[0]?.content ?? '').slice(0, 175)}{(position.description[0]?.content.length ?? 0) > 175 ? '…' : ''}</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <MarketingButton
                    label="View Details"
                    onClick={() => window.location.href = `/positions/${position.id}`}
                    variant="primary"
                />
                <MarketingButton
                    label="Copy Link"
                    variant="secondary"
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
        </div>
    );
}
