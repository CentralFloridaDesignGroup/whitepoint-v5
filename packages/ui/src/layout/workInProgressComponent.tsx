/**
 * A generic notice component to indicate that a page is a work in progress.
 * @returns JSX.Element
 */

export function WorkInProgressComponent() {
    return (
        <div className='space-y-1 bg-nile-blue-200 border-l-4 border-orange-500 px-4 py-2 rounded-r-md screen-only'>
            <p className='font-bold'>Page is a Work in Progress:</p>
            <p className='text-nile-blue'>This page is in a work-in-progress state and is considered incomplete. User discresion is advised.</p>
        </div>
    )            
}