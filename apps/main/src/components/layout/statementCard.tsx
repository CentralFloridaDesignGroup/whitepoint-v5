export function StatementCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
    return (
        <div className="px-6 py-2 text-center">
            <p className="text-gray-500 mt-2">{title}</p>
            <h2 className="text-2xl font-semibold text-primary">{value}</h2>
            {subtitle && subtitle.length > 0 && <p className="text-gray-500 mt-2">{subtitle}</p>}
        </div>
    );
}