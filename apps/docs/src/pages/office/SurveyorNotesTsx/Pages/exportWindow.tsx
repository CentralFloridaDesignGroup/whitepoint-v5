import { Button } from '@whitepoint/ui/input'
import { type NoteProps } from './notesWindow'
import { showNotification } from '@whitepoint/ui/layout';

export function ExportWindow({
    notes,
    onHide
}: {
    notes: NoteProps[];
    onHide: () => void;
}) {
    return (
        <div className='max-w-7xl mx-auto p-4'>
            <div className='flex flex-col md:flex-row md:justify-between mb-6 gap-2'>
                <h2 className="text-2xl font-bold mb-4 text-center md:text-left flex-1">Generated Surveyor Notes</h2>
                <Button colorMode="auto"
                    style='secondary'
                    onClick={() => {
                        const notesContent = notes.map((note, index) => `${index + 1}. ${note.content}`).join('\n\n');
                        navigator.clipboard.writeText(notesContent);
                        showNotification({
                            title: "Notes Copied",
                            body: "The generated notes have been copied to your clipboard.",
                            style: "success"
                        });
                    }}
                    label='Copy Notes to Clipboard'
                />
                <Button colorMode="auto"
                    style='primary'
                    onClick={onHide}
                    label='Return to Notes'
                />
            </div>
            <div className="space-y-2 mb-6">
                {notes.map((note, index) => (
                    <div key={note.title}>
                        <p className="mb-2">{index + 1}. {note.content}</p>
                    </div>
                ))}
            </div>
        </div>
    )
}
