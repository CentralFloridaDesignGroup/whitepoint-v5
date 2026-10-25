import { Button } from '../input';
import { X } from 'lucide-react';

type ModalColorMode = 'light' | 'dark' | 'auto';

function cx(...classes: Array<string | false | null | undefined>): string {
    return classes.filter(Boolean).join(' ');
}

function modeClass(colorMode: ModalColorMode, light: string, dark: string, auto: string): string {
    void colorMode;
    void dark;
    void auto;
    return light;
}

export interface ModalProperties {
    /** Dialog title shown in the modal header. */
    title: string;
    /** Whether the modal is open. */
    isOpen: boolean;
    /** Called when the primary action is accepted. */
    onAccept: () => void;
    /** Called when the modal is dismissed. */
    onClose?: () => void;
    /** Maximum modal width. Defaults to "md". */
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full';
    /** Primary action text. Defaults to "Accept". */
    acceptText?: string;
    /** Secondary close action text. Defaults to "Close". */
    closeText?: string;
    /** Disables the primary action. */
    acceptDisabled?: boolean;
    /** Shows the header close icon. Defaults to true. */
    showHeaderClose?: boolean;
    /** Shows the secondary close button. Defaults to true. */
    showCloseButton?: boolean;
    /** Target color mode for the modal. Defaults to "light". */
    colorMode?: ModalColorMode;
    /** Modal body content. */
    children: React.ReactNode;
}

export function Modal({
    title,
    isOpen,
    onAccept,
    onClose,
    size = 'md',
    acceptText = 'Accept',
    closeText = 'Close',
    acceptDisabled = false,
    showHeaderClose = true,
    showCloseButton = true,
    colorMode = 'light',
    children
}: ModalProperties): React.JSX.Element {
    const sizeClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
        '3xl': 'max-w-3xl',
        '4xl': 'max-w-4xl',
        '5xl': 'max-w-5xl',
        full: 'h-full w-full'
    };

    return (
        <dialog open={isOpen} onClose={() => { onClose?.(); }} className="bg-transparent p-0">
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-6 sm:items-center sm:px-6">
                <div
                    className={cx(
                        'max-h-[calc(100vh-3rem)] w-full overflow-y-auto rounded-xl p-6 shadow-xl sm:max-h-[calc(100vh-4rem)]',
                        sizeClasses[size],
                        modeClass(colorMode, 'bg-white text-gray-900', 'bg-gray-800 text-white', 'bg-white text-gray-900  ')
                    )}
                >
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-xl font-semibold">{title}</h2>
                        {showHeaderClose && (
                            <button
                                type="button"
                                onClick={() => { onClose?.(); }}
                                className={cx(
                                    'cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-primary/35',
                                    modeClass(colorMode, 'text-gray-500 hover:text-gray-700', 'text-gray-300 hover:text-white', 'text-gray-500 hover:text-gray-700  ')
                                )}
                                aria-label="Close dialog"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        )}
                    </div>
                    <div className="mb-4">
                        {children}
                    </div>
                    <div className="flex justify-end space-x-2">
                        {showCloseButton && (
                            <Button
                                onClick={() => { onClose?.(); }}
                                variant="secondary"
                                size="medium"
                            >{closeText}</Button>
                        )}
                        <Button
                            onClick={() => { onAccept(); }}
                            variant="primary"
                            size="medium"
                            disabled={acceptDisabled}
                        >{acceptText}</Button>
                    </div>
                </div>
            </div>
        </dialog>
    );
}
