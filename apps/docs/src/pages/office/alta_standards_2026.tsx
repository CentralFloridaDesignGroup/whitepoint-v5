import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function Alta_Standards_2026() {

    return (
        <div className=" mx-auto w-full max-w-7xl space-y-4">
            <div className='space-y-1 bg-blue-200 border-l-4 border-blue-500 p-4'>
                <p className='font-semibold text-blue-800'>Important Notice:</p>
                <p className='text-blue-800'>The 2026 ALTA / NSPS Land Title Survey Standards will become effective on February 23, 2026. All ALTA / NSPS Land Title Surveys performed on or after this date must comply with the 2026 standards. Surveys completed before this date may still adhere to the previous standards, but it is advisable to transition to the new standards as soon as possible to ensure compliance with industry practices and client expectations.</p>
            </div>
            <p className='text-2xl font-semibold text-center'>2026 ALTA / NSPS Land Title Survey Standards</p>
            <p>Below are the 2026 ALTA standards. Each section has two sides; the left side, shaded in gray, is the actual language of the standards, while the right side, shaded in yellow, provides explanations and context to help understand the requirements and their implications.</p>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                <Link to="https://nsps.us.com/resource/resmgr/alta_standards/2026_OFFICIAL_FINAL_PDF_ALTA.pdf" target='_blank' rel="noopener noreferrer" className='inline-flex items-center justify-center rounded-md bg-nile-blue px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-nile-blue-800 focus:outline-hidden focus:ring-2 focus:ring-nile-blue-500 focus:ring-offset-2 transition-colors'>Official 2026 ALTA Standards PDF</Link>
                <Link to="https://nsps.us.com/resource/resmgr/alta_standards/2026_OFFICIAL_REDLINE_PDF_AL.pdf" target='_blank' rel="noopener noreferrer" className='inline-flex items-center justify-center rounded-md bg-nile-blue px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-nile-blue-800 focus:outline-hidden focus:ring-2 focus:ring-nile-blue-500 focus:ring-offset-2 transition-colors'>Official 2026 ALTA Standards Redlined PDF</Link>
                <Link to="/reference/alta-tablea" target='_blank' rel="noopener noreferrer" className='inline-flex items-center justify-center rounded-md bg-mercury text-nile-blue px-4 py-2 text-sm font-medium shadow-sm hover:bg-mercury-800 hover:text-white focus:outline-hidden focus:ring-2 focus:ring-mercury-500 focus:ring-offset-2 transition-colors'>Optional Table A Items</Link>
            </div>
            <CollapsibleSection title="Section 1: Purpose"
                description="The purpose and intent of the ALTA / NSPS Land Title Survey standards"
                left={
                    <div className="space-y-2">
                        <p>Members of the American Land Title Association® (ALTA) have specific needs, unique to title insurance matters, when asked to insure title to land without exception as to the many matters which might be discoverable from survey and inspection, and which are not evidenced by the public records.</p>
                        <p>For a survey of real property, and the plat, map or record of such survey, to be acceptable to a title insurance company for the purpose of insuring title to said real property free and clear of survey matters (except those matters disclosed by the survey and indicated on the plat or map), certain specific and pertinent information must be presented for the distinct and clear understanding between the insured, the client (if different from the insured), the title insurance company (insurer), the lender, and the surveyor professionally responsible for the survey.</p>
                        <p>In order to meet such needs, clients, insurers, insureds, and lenders are entitled to rely on surveyors to conduct surveys and prepare associated plats or maps that are of a professional quality and appropriately uniform, complete, and accurate. To that end, and in the interests of the general public, the surveying profession, title insurers, and abstracters, the ALTA and the NSPS jointly promulgate the within details and criteria setting forth a minimum standard of performance for ALTA/NSPS Land Title Surveys. A complete ALTA/NSPS Land Title Survey includes: </p>
                        <ol className="list-[upper-alpha] list-inside space-y-1 ps-4 -indent-4">
                            <li>the fieldwork required pursuant to Section 5,</li>
                            <li>the preparation of a plat or map pursuant to Section 6 showing the results of the fieldwork and its relationship to documents provided to or obtained by the surveyor pursuant to Section 4,</li>
                            <li>any information from Table A items requested by the client, and</li>
                            <li>the certification outlined in Section 7.</li>
                        </ol>
                    </div>
                }
                right={
                    <div className="space-y-2">
                        <p>This section covers the basic purpose and intent of why the &quot;ALTA / NSPS&quot; standards exist and their importance in the surveying and title insurance industries. It is an agreed-to framework that all parties involved in a commerical land transaction (often worth hundreds of thousands or millions of dollars). In some jurisdictions, the requirements of the ALTA standards are more strict than typical boundary surveys. By adhering to these standards, surveyors help ensure that the surveys they produce are reliable and meet the expectations of title insurers, lenders, and other stakeholders. This reduces the risk of disputes and claims related to property boundaries and easements.</p>
                        <p>In order to properly conform to these standards, the survey must specifically comply with the four listed sections.</p>
                        <ol className="list-[upper-alpha] list-inside space-y-1 ps-4 -indent-4">
                            <li><b>Section 5:</b> The fieldwork requirements to complete the survey to ALTA standards.</li>
                            <li><b>Section 6:</b> The preparation of a map showing the results of the fieldwork and its relationship to documents provided to or obtained by the surveyor. This includes showing title information and other information provided by the client or title company.</li>
                            <li><b>Section 7:</b> The certification language specifically outlined in Section 7.</li>
                            <li><b>Table A:</b> Any information from Table A items requested by the client. There are 20 items in Table A that can be requested, but the client can also add custom requests (known as Item 21), which are near limitless. The list can be found under <Link to="/reference/alta-tablea" className='highlight-underline'>Optional Table A Requirements</Link>.</li>
                        </ol>
                    </div>
                }
            />
            <CollapsibleSection title="Section 2: Request for Survey"
                description="Responsibilities of the client and surveyor when requesting an ALTA/NSPS Land Title Survey"
                left={
                    <p>The client shall request the survey, or arrange for the survey to be requested, and shall provide a written authorization to proceed from the person or entity responsible for paying for the survey. Unless specifically authorized in writing by the insurer, the insurer shall not be responsible for any costs associated with the preparation of the survey. The request must specify that a <b>"2026 ALTA/NSPS LAND TITLE SURVEY"</b> is required and which of the optional items listed in Table A, if any, are to be incorporated. Certain properties or interests in real properties may present issues outside those normally encountered on an ALTA/NSPS Land Title Survey (e.g., marinas, campgrounds, mobile home parks, easements, leases, mineral interests, other non-fee simple interests). The scope of work related to surveys of such properties or interests in real properties should be discussed with the client, lender, and insurer, and agreed upon in writing prior to commencing work on the survey. When required, the client shall secure permission for the surveyor to enter upon the property to be surveyed, adjoining properties, or offsite easements</p>
                }
                right={
                    <div className="space-y-2">
                        <p>This section outlines the responsibilities of the client and surveyor when requesting an ALTA/NSPS Land Title Survey. While the stated requirements are basic, the general concept is clear communication and setting expectations at the beginning of the project. This includes:</p>
                        <ul className="list-disc list-inside space-y-1 ps-6 -indent-6">
                            <li>The client must <b>formally request</b> the survey, either <u>written or verbal.</u> </li>
                            <li>The surveyor must provide <b>written authorization</b> from the person or entity responsible for payment. This is a basic contract law requirement, not specifically for ALTA / NSPS land title surveys.
                                <p className="indent-0 italic text-gray-700">
                                    Table A items may require additional notices to the client at the contract forming stage. <b>Confirm what Table A items are needed</b> early so proper notices can be given.
                                </p>
                            </li>

                            <li>For properties with unique characteristics (e.g., marinas, campgrounds), the scope of work should be discussed and agreed upon in writing before starting the survey. More stringent requirements may apply.</li>
                            <li>The client is responsible for securing permission for the surveyor to access the property and any necessary adjoining properties or easements.</li>
                        </ul>
                    </div>
                }
            />
            <CollapsibleSection title="Section 3: Surveying Standards and Standards of Care"
                description="The professional standards and care required for ALTA/NSPS Land Title Surveys"
                left={
                    <div className="space-y-2">
                        <ol className="list-[upper-alpha] list-inside space-y-1 ps-4 -indent-4">
                            <li>
                                <b>Effective Date</b> The 2026 Minimum Standard Detail Requirements for ALTA/NSPS Land Title Surveys are effective February 23, 2026. As of that date, all previous versions of the Minimum Standard Detail Requirements for ALTA/ACSM or ALTA/NSPS Land Title Surveys are superseded by these standards.
                            </li>
                            <li>
                                <b>Other Requirements and Standards of Practice</b> Many states and some local jurisdictions have adopted statutes, administrative rules, and/or ordinances that set out standards regulating the practice of surveying within their jurisdictions. In addition to the standards set forth herein, surveyors must also conduct their surveys in accordance with applicable jurisdictional survey requirements and standards of practice. Where conflicts between the standards set forth herein and any such jurisdictional requirements and standards of practice occur, the more stringent must apply.
                            </li>
                            <li>
                                <b>The Normal Standard of Care</b> Surveyors should recognize that there may be unwritten local, state, and/or regional standards of care defined by the practice of the “prudent surveyor” in those locales.
                            </li>
                            <li>
                                <b>Boundary</b> The boundary lines and corners of any property or interest in real property being surveyed (hereafter, the “surveyed property” or “property to be surveyed”) as part of an ALTA/NSPS Land Title Survey must be established and/or retraced in accordance with appropriate boundary law principles governed by the set of facts and evidence found in the course of performing the research and fieldwork.
                            </li>
                            <li>
                                <b>Measurement Standards</b> The following measurement standards address Relative Positional Precision for the monuments or witnesses marking the corners of the surveyed property.
                                <ol className='list-[lower-roman] list-inside space-y-1 ps-4 -indent-4'>
                                    <li>"Relative Positional Precision" is the accepted indicator of measurement quality on an ALTA/NSPS Land Title Survey. It is defined as the length of the semi-major axis, expressed in meters or feet, of the error ellipse of the line connecting the monuments or witnesses marking adjacent boundary corners of the surveyed property at the 95 percent confidence level. Relative Positional Precision is most commonly estimated by the results of a correctly weighted least squares adjustment of the survey, or alternatively it can be estimated by the standard deviation of the distance between the monument or witness marking any boundary corner of the surveyed property and the monument or witness marking an immediately adjacent boundary corner of the surveyed property (called local accuracy) that can be computed using the full covariance matrix of the coordinate inverse between any given pair of points, understanding that Relative Positional Precision is based on the 95 percent confidence level.</li>
                                    <li>Any boundary lines and corners established or retraced may have uncertainties in location resulting from (1) the availability, condition, history and integrity of reference or controlling monuments, (2) ambiguities in the record descriptions or plats of the surveyed property or its adjoining properties, (3) occupation or possession lines as they may differ from the written title lines, or (4) Relative Positional Precision. Of these four sources of uncertainty, only Relative Positional Precision is controllable, although, due to the inherent errors in any measurement, it cannot be eliminated. The magnitude of the first three uncertainties can be projected based on evidence; Relative Positional Precision is estimated using statistical means (see Section 3.E.i. above and Section 3.E.v. below). </li>
                                    <li> The first three of these sources of uncertainty must be weighed as part of the evidence in the determination of where, in the surveyor's opinion, the boundary lines and corners of the surveyed property should be located (see Section 3.D. above). Relative Positional Precision is a measure of how precisely the surveyor is able to monument and report those positions; it is not a substitute for the application of proper boundary law principles. A boundary corner or line may have a small Relative Positional Precision because the survey measurements were precise, yet still be in the wrong position (i.e., inaccurate) if it was established or retraced using faulty or improper application of boundary law principles. </li>
                                    <li>For any measurement technology or procedure used on an ALTA/NSPS Land Title Survey, the surveyor must (1) use appropriately trained personnel, (2) compensate for systematic errors, including those associated with instrument calibration, and (3) use appropriate error propagation and measurement design theory (selecting the proper instruments, geometric layouts, and field and computational procedures) to control random errors such that the; maximum allowable Relative Positional Precision outlined in Section 3.E.v. below is not exceeded. </li>
                                    <li> The maximum allowable Relative Positional Precision for an ALTA/NSPS Land Title Survey is 2 cm (0.07 feet) plus 50 parts per million (based on the direct distance between the two corners being tested). It is recognized that in certain circumstances, the size or configuration of the surveyed property, or the relief, vegetation, or improvements on the surveyed property, will result in survey measurements for which the maximum allowable Relative Positional Precision may be exceeded in which case the reason shall be noted pursuant to Section 6.B.x. below. </li>
                                </ol>
                            </li>
                        </ol>
                    </div>
                }
                right={
                    <div className="space-y-2">
                        <p>This section outlines the professional standards and care required for ALTA/NSPS Land Title Surveys. It comprises of reminders, general theory statements, and one technicial requirement at the end. Key points include:</p>
                        <ul className="list-disc list-inside space-y-1 ps-6 -indent-6">
                            <li><b>Effective Date:</b> The 2026 standards are effective February 23, 2026, superseding all previous versions.</li>
                            <li><b>Compliance with Local Laws:</b> Surveyors must adhere to local, state, and regional surveying standards, applying the more stringent requirements in case of conflicts. i.e. these requirements are suplimentary, not a replacement for local laws.</li>
                            <li><b>Standard of Care:</b> Surveyors should be aware of unwritten local standards defined by the practice of the “prudent surveyor.”</li>
                            <li><b>Boundary retracement accuracy:</b> Surveyors must ensure accurate retracement of boundaries in accordance with established standards and practices. Using the 95% confidence level test (also known as the RMS value) is the accepted form of testing to use boundary corners. The minimum accuracy is <b>2cm (0.07') + 50 parts per million.</b>
                                <p className='ps-6'>For example, two points that are 200.00 feet apart get tested by:</p>
                                <p className='ps-12 italic text-gray-700'>0.07' + (50 ppm [0.00005] x 200.00 feet) = 0.07 feet + 0.01 feet = <b>0.08</b> feet</p>
                                <p className='ps-6'>This means the maximum allowable error between these two points is 0.08 feet.</p>
                            </li>
                            <li>
                                Out of the four (4) sources of uncertainty listed (boundary monument condition, record descriptions, occupation lines, and Relative Positional Precision), only Relative Positional Precision is controllable by the surveyor. The other three must be evaluated as part of the evidence in determining boundary locations in accordance with current boundary law principles. However, relative positional accuracy cannot be fully eliminated due to inherent measurement errors.
                            </li>
                            <li>There are obvious situations where the accuracy of measured boundary corners cannot meet the minimum standards due to external factors. In these situations, follow the requirements of reporting under <b>Section 6.B.x</b>.</li>
                            <li>It is the requirement of the Surveyor to ensure proper personel, training, and review of the boundary retracement process to maintain these standards.</li>
                        </ul>
                    </div>
                }
            />
            <CollapsibleSection title="Section 4: Records Research"
                description="The requirements for records research to be conducted for ALTA/NSPS Land Title Surveys"
                left={
                    <div className='space-y-2'>
                        <p>It is recognized that for the performance of an ALTA/NSPS Land Title Survey, the surveyor must be provided with appropriate and, when possible, legible data that can be relied upon in the preparation of the survey. In order to complete an ALTA/NSPS Land Title Survey, the surveyor must be provided with the following: </p>
                        <ol className="list-[upper-alpha] list-inside space-y-1 ps-4 -indent-4">
                            <li>Given the purpose of an ALTA/NSPS Land Title Survey, complete copies of the most recent title commitment or, if a title commitment is not available, other title evidence satisfactory to the title insurer (if a recent title commitment is not provided, in some cases, additional title research may be required on the part of and by the insurer or on the part of the surveyor due to state law); </li>
                            <li>The current record description of the real property to be surveyed or, in the case of an original survey prepared for purposes of locating and describing real property that has not been previously separately described in documents conveying an interest in the real property, the current record description of the parent parcel that contains the property to be surveyed; </li>
                            <li>The following documents from records established under state statutes for the purpose of imparting constructive notice of matters relating to real property (public records):
                                <ol className='list-[lower-roman] list-inside space-y-1 ps-4 -indent-4'>
                                    <li>Any recorded easements benefitting (i.e., appurtenant to) the property to be surveyed; and </li>
                                    <li>Any recorded easements, servitudes, or covenants burdening the property to be surveyed;</li>
                                </ol>
                            </li>
                            <li>If desired by the client, any unrecorded documents affecting the property to be surveyed and containing information to which the survey shall make reference. </li>
                        </ol>
                        <p>Except, however, if the documents outlined in B and C of this section are not provided to the surveyor or if non-public or quasi-public documents (e.g., highway or railroad plans) are otherwise required to complete the survey, the surveyor must conduct that research which is required pursuant to the statutory or administrative requirements of the jurisdiction where the surveyed property is located and that research (if any) which is negotiated and outlined in the terms of the contract between the surveyor and the client. </p>
                    </div>
                }
                right={
                    <div className='space-y-2'>
                        <p>Records research and receiving title is the ultimate difference between a typical boundary survey and an ALTA / NSPS Land Title survey. It is essential for ensuring the survey accurately reflects all interests and encumbrances on the property. While previous versions of these standards stated that providing the records is solely the insurer's responsibility, the current standards emphasize collaboration between the insurer and the surveyor to ensure all necessary information is obtained. Specifically, the Surveyor must perform records research to the level required to "... be located and shown upon the map"<sup>1</sup> pursuant to 5J-17.052(4)(b), Florida Administrative Code.</p>
                        <p>1: 5J-17.052(4)(d), Florida Administrative Code historically has been interpreted as the Surveyor need not to pull the records. This update does add the language that the Surveyor does have a duty to pull the publically available records.</p>
                    </div>
                }
            />
            <CollapsibleSection title="Section 5: Fieldwork Requirements"
                description="The requirements for conducting field work for ALTA / NSPS Land Title surveys."
                left={
                    <div className='space-y-2'>
                        <p>
                            The fieldwork must be performed using practices generally recognized as acceptable by the surveying profession for purposes of an ALTA/NSPS Land Title Survey. Except as related to the precision of the boundary, which is addressed in Section 3.E. above, features located during the fieldwork shall be located to what is, in the surveyor's professional opinion, the appropriate degree of precision based on (a) the planned use of the surveyed property, if reported in writing to the surveyor by the client, lender, or insurer, or (b) the existing use, if the planned use is not so reported. The fieldwork shall include the following:</p>
                        <ol className='list-[upper-alpha] list-inside ps-4 -indent-4'>
                            <li>
                                <b>Monuments:</b>
                                <ol className='list-[lower-roman] list-inside ps-4 -indent-4'>
                                    <li>The location, size, character (including relationship to surface of the ground), and type of any monuments found during the fieldwork.</li>
                                    <li>The location, size, character (including relationship to surface of the ground), and type of any monuments set during the fieldwork, if item 1 of Table A was selected or if otherwise required by applicable jurisdictional requirements and/or standards of practice.</li>
                                    <li>The location, description, and character of any lines that control the boundaries of the surveyed property.</li>
                                </ol>
                            </li>
                            <li>
                                <b>Rights-of-Way and Access:</b>
                                <ol className='list-[lower-roman] list-inside ps-4 -indent-4'>
                                    <li>The distance from the appropriate corner or corners of the surveyed property to the nearest right of way line, if the surveyed property does not abut a right of way.</li>
                                    <li>The name of any street, highway, or other public or private way abutting the surveyed property, together with the width of the travelled way and the location of each edge of the travelled way including on divided streets and highways. If the documents provided to or obtained by the surveyor pursuant to Section 4 indicate no access from the surveyed property to the abutting street or highway, the width and location of the travelled way need not be located. </li>
                                    <li>Evidence of physical access (including vehicular access such as curb cuts and driveways) to any abutting streets, highways, or other public or private ways observed in the process of conducting the fieldwork. </li>
                                    <li>The location and character of vehicular, pedestrian, or other forms of access by other than the apparent occupants of the surveyed property to or across the surveyed property observed in the process of conducting the fieldwork (e.g., driveways, alleys, private roads, railroads, railroad sidings and spurs, sidewalks, footpaths).</li>
                                    <li>Without expressing a legal opinion as to ownership or nature, the location and extent of any potentially encroaching driveways, alleys, and other ways of access from adjoining properties onto the surveyed property observed in the process of conducting the fieldwork. </li>
                                    <li> Where documentation of the location of any street, road, or highway right of way abutting, on, or crossing the surveyed property was not disclosed in documents provided to or obtained by the surveyor, or was not otherwise available from the controlling jurisdiction (see Section 6.C.iv. below), the evidence and location of parcel corners on the same side of the street as the surveyed property recovered in the process of conducting the fieldwork which may indicate the location of such right of way lines (e.g., lines of occupation, survey monuments). </li>
                                    <li>Evidence of access to and from waters adjoining the surveyed property observed in the process of conducting the fieldwork (e.g., paths, boat slips, launches, piers, docks). </li>
                                </ol>
                            </li>
                            <li>
                                <b>Lines of Possession and Improvements along the Boundaries:</b>
                                <ol className='list-[lower-roman] list-inside ps-4 -indent-4'>
                                    <li>The character and location of evidence of possession or occupation along the perimeter of the surveyed property, both by the occupants of the surveyed property and by adjoining properties, observed in the process of conducting the fieldwork regardless of proximity to the perimeter boundary lines. </li>
                                    <li>Unless physical access is restricted, the character and location of all walls, buildings, fences, and other improvements within five feet of each side of the boundary lines observed in the process of conducting the fieldwork (see Section 5.E.iv. regarding the location of utility features). Trees, bushes, shrubs, and other vegetation need not be located other than as specified in the contract, unless they are deemed by the surveyor to be evidence of possession or occupation pursuant to Section 5.C.i.</li>
                                    <li>Without expressing a legal opinion as to the ownership or nature of the potential encroachment, the evidence, location, and extent of potentially encroaching structural appurtenances and projections observed in the process of conducting the fieldwork (e.g., fire escapes, bay windows, windows and doors that open out, flue pipes, stoops, eaves, cornices, areaways, steps, trim) by or onto adjoining properties, or onto rights of way, easements, or setback lines disclosed in documents provided to or obtained by the surveyor.</li>
                                </ol>
                            </li>
                            <li>
                                <b>Buildings:</b> The location of buildings on the surveyed property observed in the process of conducting the fieldwork.
                            </li>
                            <li>
                                <b>Easements and Servitudes:</b>
                                <ol className='list-[lower-roman] list-inside ps-4 -indent-4'>
                                    <li>Evidence of Documented Easements: Evidence of any easements or servitudes burdening the surveyed property as disclosed in the documents provided to or obtained by the surveyor pursuant to Section 4 and observed in the process of conducting the fieldwork.</li>
                                    <li>Evidence of Undocumented Use (Prescriptive Easements): Evidence of easements, servitudes, or other uses by other than the apparent occupants of the surveyed property not disclosed in the documents provided to or obtained by the surveyor pursuant to Section 4, but observed in the process of conducting the fieldwork if they are on or across the surveyed property (e.g., roads, drives, sidewalks, paths and other ways of access, utility service lines, utility locate markings (including the source of the markings, with a note if unknown), water courses, ditches, drains, telephone lines, fiber optic lines, electric lines, water lines, sewer lines, oil pipelines, gas pipelines).</li>
                                    <li>Indication of Underground Easements: Surface indications of underground easements or servitudes on or across the surveyed property observed in the process of conducting the fieldwork (e.g., utility cuts, vent pipes, filler pipes, utility locate markings (including the source of the markings, with a note if unknown)).</li>
                                    <li>Evidence of Utilities: Evidence on or above the surface of the surveyed property observed in the process of conducting the fieldwork, which evidence may indicate utilities located on, above, or beneath the surveyed property. Examples of such evidence include pipeline markers, utility locate markings (including the source of the markings, with a note if unknown), manholes, valves, meters, transformers, pedestals, clean-outs, overhead lines, and guy wires on and within five feet of the surveyed property, and utility poles on or and within ten feet of the surveyed property. Without expressing a legal opinion as to the ownership or nature of the potential encroachment, the extent of all potential encroaching utility pole crossmembers or overhangs. </li>
                                </ol>
                            </li>
                            <li>
                                <b>Cemeteries:</b> As accurately as the evidence permits, the perimeter of cemeteries and burial grounds, and the location of isolated gravesites not within a cemetery or burial ground, (i) disclosed in the documents provided to or obtained by the surveyor, or (ii) observed in the process of conducting the fieldwork.
                            </li>
                            <li>
                                <b>Water Features:</b>
                                <ol className='list-[lower-roman] list-inside ps-4 -indent-4'>
                                    <li>The location of springs, ponds, lakes, streams, rivers, canals, ditches, marshes, and swamps on, running through, or outside, but within five feet of, the perimeter boundary of the surveyed property and observed during the process of conducting the fieldwork.</li>
                                    <li>The location of any water feature forming a boundary of the surveyed property. The attribute(s) of the water feature located (e.g., top of bank, edge of water, high water mark) should be congruent with the boundary as described in the record description or, in the case of an original survey, in the new description (see Section 6.B.vi. below). </li>
                                </ol>
                            </li>
                        </ol>
                    </div>
                }
                right={
                    <div className='space-y-2'>
                        <p>The survey must be performed to general surveying practices. This means either the survey is performed <b>(a) based on the planned use</b> of the survey, which must be disclosed by the client or lender, or <b>(b) based on existing use</b> if the planned use is not so reported.</p>
                        <ol className='list-[upper-alpha] list-inside ps-4 -indent-4'>
                            <li><b>Monuments</b><br />
                                You must include:
                                <ol className='list-[lower-roman] list-inside ps-4 -indent-4'>
                                    <li>All monuments found or set must include the location, size, character (including depth), and type.</li>
                                </ol>
                            </li>
                            <li><b>Rights-of-Way</b><br />
                                You must include:
                                <ol className='list-[lower-roman] list-inside ps-4 -indent-4'>
                                    <li>Distance to nearest right-of-way line if the property does not abut a right-of-way.</li>
                                    <li>Travelled area widths on rights-of-way where the property has access to.</li>
                                    <li>Evidence of physical access (aprons, driveways, curb cuts, etc.)</li>
                                    <li>Evidence where <b>others</b> may have access onto, across, or through the land.</li>
                                    <li>Evidence of encroachments by others onto the property.</li>
                                    <li>Evidence of access from water (paths, boat slips, piers, docks, etc)</li>
                                </ol>
                            </li>
                            <li><b>Lines of Possession</b><br />
                                You must include:
                                <ol className='list-[lower-roman] list-inside ps-4 -indent-4'>
                                    <li>Any occupation lines near the boundary of the subject property, regardless of proximity.</li>
                                    <li>All improvements within five (5) feet of the boundary line. Vegitation can be omitted unless it shows occupation.</li>
                                    <li>Evidence of encroachments onto or off the property.</li>
                                </ol>
                            </li>
                            <li>All buildings must be located and shown.</li>
                            <li><b>Easements and Servitudes</b><br />
                                You must include:
                                <ol className='list-[lower-roman] list-inside ps-4 -indent-4'>
                                    <li>Evidence of documented easements</li>
                                    <li>Evidence of undocumented (perscriptive) easements by readily apparent physical use.</li>
                                    <li>Above-ground evidence of underground utilities.</li>
                                </ol>
                            </li>
                            <li>Cemeteries and burial grounds must be located and shown to the surveyor's observations or provided records only.</li>
                            <li>Water bodies must be included if they are on or within five (5) feet of the property.</li>
                        </ol>
                    </div>
                }
            />
            <CollapsibleSection title="Section 6: Map Requirements"
                description="The requirements for drafting the map of survey for ALTA / NSPS Land Title surveys."
                left={
                    <div className='space-y-2'>
                        <p>
                            A plat or map of an ALTA/NSPS Land Title Survey must be prepared using practices generally recognized as acceptable by the surveying profession for purposes of an ALTA/NSPS Land Title Survey and shall show the following information. Where dimensioning is appropriate, dimensions shall be annotated to what is, in the surveyor's professional opinion, the appropriate degree of precision based on (a) the planned use of the surveyed property, if reported in writing to the surveyor by the client, lender, or insurer, or (b) existing use, if the planned use is not so reported. </p>
                        <ol className='list-[upper-alpha] list-inside ps-4 -indent-4'>
                            <li>
                                <b>Field Locations:</b> The evidence and locations gathered, and the monuments and lines located during the fieldwork pursuant to Section 5 above, with accompanying notes if deemed necessary by the surveyor or as otherwise required as specified below.
                            </li>
                            <li>
                                <b>Boundary, Descriptions, Dimensions, and Closures:</b>
                                <ol className='list-[lower-roman] list-inside ps-4 -indent-4'>
                                    <li>(a) The current record description of the surveyed property, or<br />
                                        (b) In the case of an original survey, the current record document number of the parent tract that contains the surveyed property.</li>
                                    <li>Any new description of the surveyed property that was prepared in conjunction with the survey, including a statement explaining why the new description was prepared. Except in the case of an original survey, preparation of a new description should be avoided unless deemed necessary or appropriate by the surveyor and insurer. Preparation of a new description should also generally be avoided when the record description is a lot or block in a platted, recorded subdivision. Except in the case of an original survey, if a new description is prepared, a note must be provided stating (a) that the new description describes the same real estate as the record description or, (b) if it does not, how the new description differs from the record description. </li>
                                    <li>The point of beginning, the remote point of beginning or point of commencement (if applicable) and all distances and directions identified in the record description of the surveyed property (and in the new description, if one was prepared). Where a measured or calculated dimension differs from the record by an amount deemed significant by the surveyor, such dimension must be shown in addition to, and differentiated from, the corresponding record dimension. All dimensions shown on the survey and contained in any new description must be horizontal ground dimensions unless otherwise noted.</li>
                                    <li>The direction, distance, and curve data necessary to compute a mathematical closure of the surveyed boundary. A note if the record description does not mathematically close. The basis of bearings and, where it differs from the record basis, the difference. </li>
                                    <li>The remainder of any recorded lot or existing parcel, when the surveyed property is composed of only a portion of such lot or parcel, shall be graphically depicted. Such remainder need not be included as part of the actual survey, except to the extent necessary to locate the lines and corners of the surveyed property, and it need not be fully dimensioned or drawn at the same scale as the surveyed property. </li>
                                    <li>When the surveyed property includes a title line defined by a water boundary, a note on the face of the plat or map noting the date the boundary was measured, which attribute(s) of the water feature was/were located, and the caveat that the boundary is subject to change due to natural causes and that it may or may not represent the actual location of the limit of title. When the surveyor is aware of natural or artificial realignments or changes in such boundaries, the extent of those changes and facts shall be shown or explained.</li>
                                    <li>The relationship of the boundaries of the surveyed property to its adjoining properties (e.g., contiguity, gaps, overlaps) where ascertainable from documents provided to or obtained by the surveyor and/or from field evidence gathered during the process of conducting the fieldwork. If the surveyed property is composed of multiple parcels, the extent of any gaps or overlaps between those parcels must be identified. Where gaps or overlaps are identified, the surveyor must, prior to or upon delivery of the final plat or map, disclose this to the insurer and client.</li>
                                    <li>When, in the opinion of the surveyor, the results of the survey differ significantly from the record, or if a fundamental decision related to the boundary resolution is not clearly reflected on the plat or map, the surveyor must explain this information with notes on the face of the plat or map.</li>
                                    <li>The location of buildings on the surveyed property dimensioned perpendicular to those perimeter boundary lines that the surveyor deems appropriate (i.e., where potentially impacted by a setback line) and/or as requested by the client, lender or insurer.</li>
                                    <li>A note on the face of the plat or map explaining the site conditions that resulted in a Relative Positional Precision that exceeds the maximum allowed pursuant to Section 3.E.v. </li>
                                    <li>A note on the face of the plat or map identifying areas, if any, on the boundaries of the surveyed property, to which physical access within five feet was restricted (see Section 5.C.ii.).</li>
                                    <li>A note on the face of the plat or map identifying the source of the title commitment or other title evidence provided pursuant to Section 4, and the effective date and the name of the insurer of same.</li>
                                </ol>
                            </li>
                            <li>
                                <b>Easements, Servitudes, Rights-of-Way, Access, and Documents:</b>
                                <ol className='list-[lower-roman] list-inside ps-4 -indent-4'>
                                    <li>The location, width, and recording information of all plottable rights of way, easements, and servitudes burdening and benefitting (i.e., appurtenant to) the surveyed property, as evidenced by documents provided to or obtained by the surveyor pursuant to Section 4.</li>
                                    <li>
                                        A summary of all rights of way, easements, and other survey-related matters burdening the surveyed property and identified in the title evidence provided to or obtained by the surveyor pursuant to Section 4. Such summary must include the record information of each such right of way, easement, or other survey-related matter, a statement indicating whether it lies within or crosses the surveyed property, and a related note for each of the following conditions, if present:
                                        <ol className='list-[lower-alpha] list-inside ps-4 -indent-4'>
                                            <li>its location is shown;</li>
                                            <li>its location cannot be determined from the record document;</li>
                                            <li>there was no observed evidence at the time of the fieldwork;</li>
                                            <li>it is a blanket easement;</li>
                                            <li>it is not on, does not touch, and/or - based on the description contained in the record document - does not affect, the surveyed property;</li>
                                            <li>it limits access to an otherwise abutting right of way;</li>
                                            <li>the documents are illegible; or</li>
                                            <li>the surveyor has information indicating that it may have been released or otherwise terminated.</li>
                                        </ol>
                                        In cases where the surveyed property is composed of multiple parcels, indicate which of such parcels the various rights of way, easements, and other survey-related matters cross or touch.
                                    </li>
                                    <li>A note if no physical access to an abutting street, highway, or other public or private way was observed in the process of conducting the fieldwork.</li>
                                    <li>The locations and widths of rights of way abutting or crossing the surveyed property and the source of such information (a) where available from the controlling jurisdiction, or (b) where disclosed in documents provided to or obtained by the surveyor pursuant to Section 4.</li>
                                    <li>The identifying titles of all recorded plats, filed maps, right of way maps, or similar documents that the survey represents, wholly or in part, with their recording or filing data.</li>
                                    <li>For non-platted adjoining properties, recording data and tax parcel number, identifying adjoining properties according to current tax records, where available. For platted adjoining properties, the recording data of the subdivision plat.</li>
                                    <li>Platted setback or building restriction lines that appear on recorded subdivision plats or that were disclosed in documents provided to, or obtained by, the surveyor.</li>
                                    <li>If in the process of preparing the survey the surveyor becomes aware of a recorded easement not otherwise listed in the title evidence provided, the surveyor must advise the insurer prior to delivery of the plat or map and, unless the insurer provides evidence that the easement has been terminated or extinguished, show or otherwise explain it on the face of the plat or map, with a note that the insurer has been advised.</li>
                                </ol>
                            </li>
                            <li>
                                <b>Presentation:</b>
                                <ol className='list-[lower-roman] list-inside ps-4 -indent-4'>
                                    <li>The plat or map must be drawn on a sheet of not less than 8 ½ by 11 inches in size at a legible, standard engineering scale, with that scale clearly indicated in words or numbers and with a graphic scale.</li>
                                    <li>
                                        The plat or map must include:
                                        <ol className='list-[lower-alpha] list-inside ps-4 -indent-4'>
                                            <li>The boundary of the surveyed property drawn in a manner that distinguishes it from other lines on the plat or map.</li>
                                            <li>If no buildings were observed on the surveyed property in the process of conducting the fieldwork, a note stating “No buildings observed.”</li>
                                            <li>A north arrow (with north to the top of the drawing when practicable).</li>
                                            <li>A legend of symbols and abbreviations.</li>
                                            <li>A vicinity map showing the surveyed property in reference to nearby highway(s) or major street intersection(s).</li>
                                            <li>Supplementary or detail diagrams when necessary.</li>
                                            <li>Notes explaining any modifications to Table A items and the nature of any additional Table A items (e.g., 21(a), 21(b), 21(c)) that were negotiated between the surveyor and client.</li>
                                            <li>The surveyor's project number (if any), and the name, registration or license number, signature, seal, street address, telephone number, company website, and email address (if any) of the surveyor who performed the survey.</li>
                                            <li>The date(s) of any revisions made by the surveyor who performed the survey.</li>
                                            <li>Sheet numbers where the plat or map is composed of more than one sheet.</li>
                                            <li>The caption “ALTA/NSPS Land Title Survey.”</li>
                                            <li>Notation of any parol statements by interested landowners or occupants as to title or boundary issues relating to the surveyed property.</li>
                                        </ol>
                                    </li>
                                    <li>When recordation or filing of a plat or map is required by state statute, administrative rule or local ordinance, such plat or map shall be produced in the required form and at a legible scale.</li>
                                </ol>
                            </li>
                        </ol>
                    </div>
                }
                right={
                    <div className='space-y-2'>
                        <p>See the <a href='/checklists/alta-survey' className='underline text-nile-blue'>ALTA Survey Checklist</a> for required items on a survey.</p>
                    </div>
                }
            />
            <CollapsibleSection title="Section 7: Certification"
                description="The requirements for certifiying an ALTA / NSPS Land Title surveys."
                left={
                    <div className='space-y-2'>
                        <ol className="list-[upper-alpha] list-inside space-y-1 ps-4 -indent-4">
                            <li>
                                The plat or map of an ALTA/NSPS Land Title Survey must bear only the following unaltered certification except as may be required pursuant to Section 3.B. above:
                                <p className='ps-4 indent-0 italic'>To (name of insured, if known), (name of lender, if known), (name of insurer, if known), (names of others as negotiated with the client):<br />
                                    This is to certify that this map or plat and the survey on which it is based were made in accordance with the 2026 Minimum Standard Detail Requirements for ALTA/NSPS Land Title Surveys, jointly established and adopted by ALTA and NSPS, and includes Items ___________ of Table A thereof. The fieldwork was completed on ___________ [date].<br />
                                    Date of Plat or Map: __________ (Surveyor's signature, printed name and seal with Registration/License Number)</p>
                            </li>
                            <li>
                                Certification may be extended to successors and assigns of the lender if requested.
                            </li>
                        </ol>
                    </div>
                }
                right={
                    <div className='space-y-2'>
                        <ul className='list-disc list-inside ps-6 -indent-6'>
                            <li>The important part of the certification is <b>who</b> the survey is certified to and <b>what</b> items from Table A are included in the survey.</li>
                            <li>The template language provided shouldn't be changed unless told to by the Surveyor.</li>
                        </ul>
                    </div>
                }
            />
            <CollapsibleSection title="Section 8: Deliverables"
                description="The requirements for delivering an ALTA / NSPS Land Title surveys."
                left={
                    <div className='space-y-2'>
                        <p>The surveyor shall furnish copies of the plat or map of survey to the insurer and client and as otherwise negotiated with the client. Hard copies shall be on durable and dimensionally stable material of a quality standard acceptable to the insurer. A digital image of the plat or map may be provided in addition to, or in lieu of, hard copies pursuant to the terms of the contract. If the surveyor is required to record or file a plat or map pursuant to state statute, administrative rule or local ordinance it must be so recorded or filed. </p>
                    </div>
                }
                right={
                    <div className='space-y-2'>
                        <p>The Surveyor has to actually deliver the survey, either in digital or physical form, and comply with all submittal requirements of jurisdictions and specific client agreements.</p>
                    </div>
                }
            />
        </div>
    )
}

/**
 * A collapsible section component with a title, description, and two content areas.
 * @param {string} title - The title of the section.
 * @param {string} description - A brief description of the section.
 * @param {React.ReactNode} left - Content to display in the left area.
 * @param {React.ReactNode} right - Content to display in the right area.
 * @param {boolean} defaultOpen - Whether the section is open by default. Default is false.
 * @returns JSX.Element
 * @deprecated This will be transferred to a more generic component library in the future.
 */
function CollapsibleSection({ title, description, left, right, defaultOpen = false } : {
    title: string,
    description: string,
    left: React.ReactNode,
    right: React.ReactNode,
    defaultOpen?: boolean
}) {
    const [open, setOpen] = useState(defaultOpen)

    return (
        <section className="w-full rounded-lg bg-white inset-ring-1 inset-ring-gray-200 py-6">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-4 text-left"
                aria-expanded={open}
            >
                <h3 className="text-base font-semibold text-nile-blue m-0">{title}</h3>
                <Chevron open={open} />
            </button>

            <p className="px-4 py-2 text-gray-600">{description}</p>

            {open && (
                <div className="border-t border-gray-200 px-4 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="min-h-12 rounded-md bg-gray-50 p-3 inset-ring-1 inset-ring-gray-200">
                            <p className='font-semibold text-center'>Literal Text</p>
                            {left}
                        </div>
                        <div className="min-h-12 rounded-md bg-yellow-50 p-3 inset-ring-1 inset-ring-gray-200">
                            <p className='font-semibold text-center'>Surveyor's Layman Interpretation</p>
                            {right}
                        </div>
                    </div>
                </div>
            )}
        </section>
    )
}

function Chevron({ open }: { open: boolean }) {
    return (
        <svg
            className={`size-5 text-gray-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <polyline points="6 9 12 15 18 9" />
        </svg>
    )
}
