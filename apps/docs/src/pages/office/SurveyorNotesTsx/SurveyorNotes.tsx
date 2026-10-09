import { useState, useEffect } from 'react';
import { SettingsWindow } from './Pages/settingsWindow';
import { NotesWindow, type NoteProps } from './Pages/notesWindow';
import { ExportWindow } from './Pages/exportWindow';

/**
 * SurveyNotes component is responsible for rendering the survey notes interface, including the settings window for configuring survey parameters.
 */
export interface SurveyNotesProps {
    /**
     * The key of the survey parameter.
     */
    key: string;
    /**
     * The value of the survey parameter. Can be null if the parameter has not been set yet.
     */
    value: string | null;
}

export default function SurveyNotesTsx() {
    const [stage, setStage] = useState<'parameters' | 'view' | 'export'>('parameters');
    const [parameters, setParameters] = useState<SurveyNotesProps[]>([]);
    const [exportNotes, setExportNotes] = useState<NoteProps[]>([]);

        useEffect(() => {
            document.title = "Surveyor Notes - The Compass";

        }, []);

    function onAcceptParameters(newParameters: SurveyNotesProps[]) {
        setParameters(newParameters);
        setStage('view');
    }

    return (
        <div>
            {stage === 'parameters' && <SettingsWindow parameters={parameters} onAccept={onAcceptParameters} onHide={() => setStage('view')} />}
            {stage === 'view' && <NotesWindow parameters={parameters} onHide={() => setStage('parameters')} onExport={(notes) => { setExportNotes(notes); setStage('export'); }} />}
            {stage === 'export' && <ExportWindow notes={exportNotes} onHide={() => setStage('view')} />}
        </div>
    )
}