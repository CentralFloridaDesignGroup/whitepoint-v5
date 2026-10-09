/** Returns an error when an active employee's reporting chain is invalid. */
export function validateReportingManagers(managers: Map<string,string|null>): string|null {
  for(const [userId] of managers){
    const visited=new Set<string>()
    let cursor=managers.get(userId)
    while(cursor){
      if(cursor===userId||visited.has(cursor))return 'Reporting managers cannot form a cycle.'
      visited.add(cursor)
      if(!managers.has(cursor))return 'Select an active internal manager.'
      cursor=managers.get(cursor)||null
    }
  }
  return null
}
