import { Dates } from '@whitepoint/utils';
import { Modal } from '@whitepoint/ui/layout';
import { StatementCard } from '../components/layout/statementCard';
import { useState } from 'react';

export function Company() {
    const companyStats = [
        {
            title: "Years in Business",
            value: new Date().getFullYear() - 2025 + "+ years",
            subtitle: ""
        },
        {
            title: "Years of Experience",
            value: new Date().getFullYear() - 2016 + "+ years",
            subtitle: ""
        },
        {
            title: "Projects Completed",
            value: "250+",
            subtitle: ""
        }
    ];

    const companyValues = [
        {
            title: "Constant Professionalism",
            description: "ensuring we approach every interaction with integrity, respect, and a commitment to excellence."
        },
        {
            title: "Excellence through Service",
            description: "where we strive to deliver outstanding results to both each other and our clients."
        },
        {
            title: "Nonstop Curiosity",
            description: "that fosters constant development and improvement for ourselves, the company, and our clients."
        }
    ]

    const teamMembers = [
        {
            name: "Nathan White",
            suffix: "PSM, CST-IV",
            title: "Owner and President",
            image: "/headshots/nathan_white.jpg",
            description: "Nathan is the owner and president of White Point Surveying & Mapping. He has been in the surveying industry since 2016, and has a wide range of experience in both field and office work. He is a licensed Professional Surveyor and Mapper in the state of Florida, and is also a Certified Survey Technician IV in both field and office operations. Nathan is passionate about providing high-quality surveying services to his clients, and is committed to maintaining the highest standards of practice in the industry.",
            certifications: [
                {
                    name: "Professional Surveyor and Mapper",
                    issuingOrganization: "Florida Board of Professional Surveyors and Mappers",
                    dateObtained: "2025-12-01",
                    idNumber: "LS7669"
                },
                {
                    name: "Certified Survey Technician IV - Field",
                    issuingOrganization: "National Society of Professional Surveyors",
                    dateObtained: "2025-10-01",
                    idNumber: "0423-7937"
                },
                {
                    name: "Certified Survey Technician IV - Office",
                    issuingOrganization: "National Society of Professional Surveyors",
                    dateObtained: "2024-05-01",
                    idNumber: "0423-7937"
                }
            ],
            professionalOrganizations: [
                "National Society of Professional Surveyors (NSPS)",
                "Florida Surveying and Mapping Society (FSMS) - Central Florida Chapter",
                "American Society of Photogrammetry and Remote Sensing (ASPRS)"
            ]
        }
    ]

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-4xl font-bold text-primary mb-6 text-center">About Our Firm</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <h2 className="text-2xl font-semibold text-gray-700 md:col-span-3 text-center">Quick Statistics</h2>
                {companyStats.map((stat, index) => (
                    <StatementCard key={index} title={stat.title} value={stat.value} subtitle={stat.subtitle} />
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 border-t pt-6">
                <h2 className="text-2xl font-semibold text-gray-700 md:col-span-3 text-center">Our Values</h2>
                {companyValues.map((value, index) => (
                    <CompanyValueCard key={index} {...value} />
                ))}
            </div>
            <div className="mt-6 border-t pt-6">
                <h2 className="text-2xl font-semibold text-gray-700 text-center">Our Mission</h2>
                <p className="text-gray-700 mt-4 text-center">
                    At <span className="text-primary font-semibold">White Point Surveying & Mapping</span>, our mission is simple; provide good, high-quality surveying services to our clients. This is provided by maintaining high standards of practice, consistent innovation and training, and a want by all involved to be a go-to survey firm. Every client has different needs, our goal is to meet needs with responses, not just talk or show. If you have a question, ask. If you have a problem, tell us. We want to be the best at what we do, and that means being responsive to our clients and their needs.
                </p>
            </div>
            <h2 className="text-2xl font-semibold text-gray-700 text-center mt-6 border-t pt-6">Meet the Team</h2>
            <p className="text-center text-gray-700 mb-2">Click on a team member to view their full profile.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {teamMembers.map((member, index) => (
                    <TeamMemberCard key={index} {...member} />
                ))}
            </div>
        </div>
    );
}

function CompanyValueCard({ title, description }: { title: string; description: string }) {
    return (
        <div className="px-6 py-2 text-center">
            <h3 className="text-xl font-semibold text-primary mb-2">{title}</h3>
            <p className="text-gray-700">{description}</p>
        </div>
    );
}

function TeamMemberCard({ name, suffix, title, description, certifications, professionalOrganizations, image }: { name: string; suffix?: string; title: string; description: string; certifications: certificationDetail[]; professionalOrganizations: string[]; image: string }) {
    const [showModal, setShowModal] = useState(false);

    return (
        <>
            <div className="px-6 py-2 text-center cursor-pointer" onClick={() => setShowModal(true)}>
                <img src={image} alt={`${name}'s headshot`} className="h-50 w-auto rounded mx-auto mb-4 object-cover" />
                <h3 className="text-xl font-semibold text-primary">{name}{suffix && `, ${suffix}`}</h3>
                <p className="text-gray-500">{title}</p>
            </div>
            <Modal
                title={`${name}'s Profile`}
                isOpen={showModal}
                onAccept={() => setShowModal(false)}
                onClose={() => setShowModal(false)}
                size="5xl"
                acceptText="Close"
                showHeaderClose={true}
                showCloseButton={false}
            >
                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                    <div className="text-center">
                        <img src={image} alt={`${name}'s headshot`} className="h-80 w-auto rounded mx-auto mb-2 object-cover" />
                        <h2 className="text-xl font-semibold text-primary">{name}{suffix && `, ${suffix}`}</h2>
                        <p className="text-gray-500 mb-2">{title}</p>
                    </div>
                    <div>
                        <p className="text-gray-700 mb-2 border-b pb-2">{description}</p>
                        {certifications.map((cert, index) => (
                            <div key={index} className="text-gray-700 mb-2 text-center md:text-start">
                                <p className='hidden md:block'><strong>{cert.name}</strong> | {cert.idNumber}</p>
                                <p className='block md:hidden'><strong>{cert.name}</strong><br />License Number: {cert.idNumber}</p>
                                <p>{cert.issuingOrganization}</p>
                                <p>Obtained: {Dates.formatDate(new Date(cert.dateObtained), 'MMMM dd, yyyy')}</p>
                            </div>
                        ))}
                        <h3 className="text-xl font-semibold text-primary mb-2 pt-2 border-t">Professional Organizations</h3>
                        <ul className="list-disc list-inside pl-5 indent-[-1.25rem]">
                            {professionalOrganizations.map((org, index) => (
                                <li key={index}>
                                    {org}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </Modal>
        </>
    );
}

interface certificationDetail {
    name: string;
    issuingOrganization: string;
    dateObtained: string;
    idNumber: string;
}