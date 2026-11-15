// Verify the commands the prompt now recommends, in a throwaway document.
import * as pc from '../service/photocraft.mjs';

const doc = await pc.newDocument({ width: 900, height: 900, background: '#ffffff', name: 'probe-prostack' });
console.log('new doc:', JSON.stringify(doc));
const docIndex = doc?.document ?? doc?.index;

const shape = await pc.command('shape.create', {
  kind: 'rect', rect: [100, 100, 400, 400], fill: '#2b6cb0', name: 'Plate',
});
console.log('shape:', JSON.stringify(shape).slice(0, 160));

const adj = await pc.command('layer.newAdjustmentLayer.hueSaturation', { hue: 30, saturation: 20, name: 'Warm' });
console.log('adjustment:', JSON.stringify(adj).slice(0, 200));

const adjId = adj?.id ?? adj?.layer;
if (adjId) {
  const clip = await pc.command('layer.createClippingMask', { layer: adjId });
  console.log('clip:', JSON.stringify(clip).slice(0, 160));
}

const type = await pc.command('type.create', {
  x: 100, y: 700, text: 'TRACKING TEST', name: 'TypeProbe', font: 'Impact', size: 90, color: '#111111',
});
console.log('type:', JSON.stringify(type).slice(0, 120));
const typeId = type?.id ?? type?.layer;
if (typeId) {
  await pc.command('type.setStyle', { layer: typeId, tracking: -40, leading: 80, caps: 'all' });
  const info = await pc.command('type.info', { layer: typeId });
  const t = info?.text ?? info;
  console.log('type.info size/tracking/leading:', JSON.stringify({
    size: t?.sizePt ?? t?.size, tracking: t?.tracking, leading: t?.leading, caps: t?.caps,
  }));
}

const group = await pc.command('layer.groupLayers', { layer: shape?.id ?? shape?.layer, name: 'Stack' });
console.log('group:', JSON.stringify(group).slice(0, 200));

const audit = await pc.audit({});
console.log('audit:', JSON.stringify(audit).slice(0, 400));
console.log('--- layers ---');
for (const l of (await pc.inspect()).layers) console.log(' ', l.id, l.kind, l.name, l.clipped ? 'clipped' : '');

// close the probe document (do not touch the user's documents)
await pc.command('file.close', { document: docIndex });
console.log('closed probe', docIndex);
process.exit(0);
