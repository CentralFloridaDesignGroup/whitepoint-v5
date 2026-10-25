export type PageMetadata = { title: string; description: string; noindex?: boolean };

export function setPageMetadata({ title, description, noindex = false }: PageMetadata): void {
  document.title = title;
  for (const [name, content] of Object.entries({ description, robots: noindex ? 'noindex,nofollow' : 'index,follow' })) {
    let element = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!element) { element = document.createElement('meta'); element.name = name; document.head.append(element); }
    element.content = content;
  }
}
