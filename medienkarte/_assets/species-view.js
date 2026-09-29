// Names projected from App V1.1's free area.species/resolveAreaSpecies display.
// No species filter, scores, inference or extra map interaction.
export function speciesSection(labels,doc=document){
  if(!Array.isArray(labels)||!labels.length)return null;
  const section=doc.createElement('section');section.className='possible-species';
  const title=doc.createElement('h3');title.textContent='Mögliche Pilzarten';
  const list=doc.createElement('ul');list.className='species-labels';
  for(const name of labels.slice(0,5)){
    const item=doc.createElement('li');item.textContent=name;list.append(item);
  }
  section.append(title,list);return section;
}
