import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateScanDto } from './create-scan.dto';

const validPayload = {
  brandName: 'NimbusCRM',
  website: 'https://nimbuscrm.test',
  competitors: ['OrbitDesk'],
  prompts: ['What CRM is best?', 'What CRM is cheapest?', 'What CRM is easiest?'],
};

function validateDto(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateScanDto, payload);
  return validate(dto);
}

describe('CreateScanDto validation', () => {
  it('passes with a fully valid payload', async () => {
    const errors = await validateDto(validPayload);
    expect(errors).toHaveLength(0);
  });

  it('fails when brandName is empty', async () => {
    const errors = await validateDto({ ...validPayload, brandName: '' });
    expect(errors.some((error) => error.property === 'brandName')).toBe(true);
  });

  it('fails when website is not a valid URL', async () => {
    const errors = await validateDto({ ...validPayload, website: 'not-a-url' });
    expect(errors.some((error) => error.property === 'website')).toBe(true);
  });

  it('fails with 0 competitors (below the minimum of 1)', async () => {
    const errors = await validateDto({ ...validPayload, competitors: [] });
    expect(errors.some((error) => error.property === 'competitors')).toBe(true);
  });

  it('fails with 4 competitors (above the maximum of 3)', async () => {
    const errors = await validateDto({
      ...validPayload,
      competitors: ['A', 'B', 'C', 'D'],
    });
    expect(errors.some((error) => error.property === 'competitors')).toBe(true);
  });

  it('fails with 2 prompts (below the minimum of 3)', async () => {
    const errors = await validateDto({ ...validPayload, prompts: ['a', 'b'] });
    expect(errors.some((error) => error.property === 'prompts')).toBe(true);
  });

  it('fails with 6 prompts (above the maximum of 5)', async () => {
    const errors = await validateDto({
      ...validPayload,
      prompts: ['a', 'b', 'c', 'd', 'e', 'f'],
    });
    expect(errors.some((error) => error.property === 'prompts')).toBe(true);
  });
});
