import { useState } from 'react';
import { Button } from '@whitepoint/ui/input';
import { showNotification } from '@whitepoint/ui/layout';

export function NoteBlock({
    title,
    description,
    content,
    onExportChange
}: {
    title: string;
    description: string;
    content: string;
    onExportChange?: (include: boolean) => void;
}) {
    const [includeExport, setIncludeExport] = useState(false);

    return (
        <div className={`p-4  ${includeExport ? 'border-2 border-green-500' : 'border-y border-primary'}`}>
            <div className="flex flex-col md:flex-row gap-2 mb-2 items-center justify-between">
                <h2 className="text-xl font-semibold grow text-center md:text-left">{title}</h2>
                <div className="grid grid-cols-2 gap-2">
                    <Button
                        variant="secondary"

                        onClick={() => {
                            navigator.clipboard.writeText(content);
                            showNotification({
                                title: 'Note Copied',
                                body: <p>Note <strong>{title}</strong> has been copied to your clipboard.</p>,
                                style: 'success'
                            });
                        }}
                    >Copy Note</Button>
                    <Button
                        variant={includeExport ? 'success' : 'primary'}
                        onClick={() => {
                            setIncludeExport(prev => !prev);
                            onExportChange?.(!includeExport);
                        }}
                    >{includeExport ? 'Remove from Export' : 'Include Export'}</Button>
                </div>
            </div>
            <p className="text-gray-700  mb-2">{description}</p>
            <p className="border border-dashed border-primary  p-2 whitespace-pre-wrap text-lg cursor-pointer "
                onClick={() => {
                            navigator.clipboard.writeText(content);
                            showNotification({
                                title: 'Note Copied',
                                body: <p>Note <strong>{title}</strong> has been copied to your clipboard.</p>,
                                style: 'success'
                            });
                        }}>{content}</p>
        </div>
    );
}
