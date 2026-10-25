import { useState, useEffect } from 'react';
import { notes as Notes } from './SurveyNoteDefinitions.json'
import { type SurveyNotesProps } from '../SurveyorNotes';
import { Button } from '@whitepoint/ui/input';
import * as Dates from '@whitepoint/utils/dates';
import { NoteBlock } from '../components/noteBlock'

export function NotesWindow({
    parameters,
    onHide,
    onExport
}: {
    parameters: SurveyNotesProps[];
    onHide: () => void;
    onExport: (notes: NoteProps[]) => void;
}) {
    const [generatedNotes, setGeneratedNotes] = useState<NoteProps[]>([]);
    const [exportNotes, setExportNotes] = useState<NoteProps[]>([]);

    useEffect(() => {
        const generatedNotes: NoteProps[] = [];
        Notes.forEach(note => {
            let generatedNote = note.content;
            parameters.forEach(param => {
                if (!param.value || param.value.trim() === '') {
                    return;
                }
                const placeholder = `{${param.key}}`;
                const dateRegex = new RegExp('^\\d{4}-\\d{2}-\\d{2}$'); // Simple regex to check for YYYY-MM-DD format
                if (dateRegex.test(param.value)) {
                    const dateString = Dates.formatDate(param.value, 'MM.dd.yyyy');
                    generatedNote = generatedNote.replaceAll(placeholder, dateString);
                } else {
                    generatedNote = generatedNote.replaceAll(placeholder, param.value || '');
                }
            });
            generatedNotes.push({
                title: note.title,
                description: note.description,
                content: generatedNote.toUpperCase()
            });
        });
        setGeneratedNotes(generatedNotes);
    }, [parameters]);

    return (
        <div className="max-w-7xl mx-auto p-4">
            <div className='flex flex-col md:flex-row md:justify-between mb-6 gap-2'>
                <h2 className="text-2xl font-bold mb-4 text-center md:text-left flex-1">Surveyor Notes</h2>
                {exportNotes.length > 0 && (
                    <Button
                        variant='success'
                        onClick={() => onExport(exportNotes)}
                    >{`Export ${exportNotes.length} Note${exportNotes.length > 1 ? 's' : ''}`}</Button>
                )}
                <Button
                    variant='primary'
                    onClick={onHide}

                >Open Parameters</Button>
            </div>
            <div className="space-y-4 mb-6">
                {generatedNotes.map((note, index) => (
                    <NoteBlock
                        key={index}
                        onExportChange={(include) => {
                            setExportNotes(prev => {
                                const newExportNotes = [...prev];
                                if (include) {
                                    newExportNotes.push(note);
                                } else {
                                    const index = newExportNotes.findIndex(n => n.title === note.title);
                                    if (index !== -1) {
                                        newExportNotes.splice(index, 1);
                                    }
                                }
                                return newExportNotes;
                            });
                        }}
                        {...note}
                    />
                ))}
            </div>
        </div>
    );
}

export interface NoteProps {
    title: string;
    description: string;
    content: string;
}
