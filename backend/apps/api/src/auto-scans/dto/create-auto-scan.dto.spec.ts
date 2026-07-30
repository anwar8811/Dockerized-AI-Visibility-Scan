import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAutoScanDto } from './create-auto-scan.dto';

const fullPayload = {
  website: 'https://eleganttechbd.com',
  brandName: 'Elegant',
  competitors: ['PixelForge Studio', 'CodeCraft Labs'],
  prompts: [
    'What is the best product studio for building an AI-native MVP quickly?',
    'Which full-stack team can take a startup idea to a launched product in a few weeks?',
    'What product development studio offers strategy, UX design, engineering, and AI together?',
  ],
};

function validateDto(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateAutoScanDto, payload);
  return validate(dto);
}

describe('CreateAutoScanDto validation', () => {
  it('passes with all 4 fields supplied', async () => {
    const errors = await validateDto(fullPayload);
    expect(errors).toHaveLength(0);
  });

  it('passes when brandName is omitted entirely', async () => {
    const { brandName, ...payload } = fullPayload;
    void brandName;
    const errors = await validateDto(payload);
    expect(errors).toHaveLength(0);
  });

  it('passes when prompts is omitted entirely', async () => {
    const { prompts, ...payload } = fullPayload;
    void prompts;
    const errors = await validateDto(payload);
    expect(errors).toHaveLength(0);
  });

  it('passes when both brandName and prompts are omitted (only website + competitors)', async () => {
    const { brandName, prompts, ...payload } = fullPayload;
    void brandName;
    void prompts;
    const errors = await validateDto(payload);
    expect(errors).toHaveLength(0);
  });

  it('fails when website is missing', async () => {
    const { website, ...payload } = fullPayload;
    void website;
    const errors = await validateDto(payload);
    expect(errors.some((error) => error.property === 'website')).toBe(true);
  });

  it('fails when website is not a valid URL', async () => {
    const errors = await validateDto({ ...fullPayload, website: 'not-a-url' });
    expect(errors.some((error) => error.property === 'website')).toBe(true);
  });

  it('fails with 0 competitors (below the minimum of 1)', async () => {
    const errors = await validateDto({ ...fullPayload, competitors: [] });
    expect(errors.some((error) => error.property === 'competitors')).toBe(true);
  });

  it('fails with 4 competitors (above the maximum of 3)', async () => {
    const errors = await validateDto({
      ...fullPayload,
      competitors: ['A', 'B', 'C', 'D'],
    });
    expect(errors.some((error) => error.property === 'competitors')).toBe(true);
  });

  it('fails when competitors is omitted entirely (still required)', async () => {
    const { competitors, ...payload } = fullPayload;
    void competitors;
    const errors = await validateDto(payload);
    expect(errors.some((error) => error.property === 'competitors')).toBe(true);
  });

  it('fails when brandName is supplied but empty', async () => {
    const errors = await validateDto({ ...fullPayload, brandName: '' });
    expect(errors.some((error) => error.property === 'brandName')).toBe(true);
  });

  it('fails with 2 supplied prompts (below the minimum of 3, even though prompts is optional)', async () => {
    const errors = await validateDto({ ...fullPayload, prompts: ['only one', 'only two'] });
    expect(errors.some((error) => error.property === 'prompts')).toBe(true);
  });

  it('fails with 6 supplied prompts (above the maximum of 5)', async () => {
    const errors = await validateDto({
      ...fullPayload,
      prompts: ['a', 'b', 'c', 'd', 'e', 'f'],
    });
    expect(errors.some((error) => error.property === 'prompts')).toBe(true);
  });
});
