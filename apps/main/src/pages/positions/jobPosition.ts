export type JobPosition = {
  id: string
  displayName: string
  isActive: boolean
  basicInfo: {
    positionOpenDate: string
    positionEndDate: string
    positionSalaryType: string
    startingSalary: number
    endingSalary?: number
    positionType: string
    positionCity: string
    positionState: string
    department: string
  }
  description: { type: 'paragraph' | 'list-bulleted' | 'list-numbered'; content: string }[]
  benefits: string[]
  requirements: string[]
  meta: { tags: string[] }
}
