import { describe, expect, it } from 'vitest';
import { extractSellerProfileFields } from './profileFieldExtraction';

const LABELED_EXAMPLE = `Name Ravi Kumar
Email ravi.kumar@example.com
Phone +91 98765 43210
Location Kanchipuram, Tamil Nadu
Craft Handwoven Kanchipuram Silk Sarees
Years of experience 18 years
Your story I come from a family of traditional weavers in Kanchipuram, and I learned the craft from my father when I was a young boy. For nearly two decades, I have been creating handwoven silk sarees using traditional weaving techniques passed down through generations. Every saree takes several days to complete, from selecting the silk and zari to carefully weaving the final design. Through my work, I want to preserve our family's weaving tradition while bringing authentic Kanchipuram craftsmanship to customers across India.`;

describe('extractSellerProfileFields', () => {
  it('extracts all 7 labeled seller fields from the canonical one-shot example', () => {
    const result = extractSellerProfileFields(LABELED_EXAMPLE);

    expect(result.name).toBe('Ravi Kumar');
    expect(result.email).toBe('ravi.kumar@example.com');
    expect(result.phone).toBe('+919876543210');
    expect(result.location).toBe('Kanchipuram, Tamil Nadu');
    expect(result.craft).toBe('Handwoven Kanchipuram Silk Sarees');
    expect(result.experienceYears).toBe(18);
    expect(result.story).toBe(
      "I come from a family of traditional weavers in Kanchipuram, and I learned the craft from my father when I was a young boy. For nearly two decades, I have been creating handwoven silk sarees using traditional weaving techniques passed down through generations. Every saree takes several days to complete, from selecting the silk and zari to carefully weaving the final design. Through my work, I want to preserve our family's weaving tradition while bringing authentic Kanchipuram craftsmanship to customers across India.",
    );
    expect(Object.keys(result)).toHaveLength(7);
  });

  it('does not use story text as location', () => {
    const result = extractSellerProfileFields(LABELED_EXAMPLE);
    expect(result.location).not.toMatch(/family of traditional weavers/i);
    expect(result.location).toBe('Kanchipuram, Tamil Nadu');
  });

  it('extracts natural-language variations', () => {
    const result = extractSellerProfileFields(
      "I'm Ravi Kumar, my email is ravi.kumar@example.com, phone +91 98765 43210. I live in Kanchipuram, Tamil Nadu. I practice Handwoven Kanchipuram Silk Sarees. I have 18 years of experience. Story: I come from a family of traditional weavers in Kanchipuram, and I learned the craft from my father when I was a young boy. For nearly two decades, I have been creating handwoven silk sarees.",
    );

    expect(result.name).toBe('Ravi Kumar');
    expect(result.email).toBe('ravi.kumar@example.com');
    expect(result.phone).toBe('+919876543210');
    expect(result.location).toMatch(/Kanchipuram/i);
    expect(result.craft?.toLowerCase()).toContain('handwoven');
    expect(result.experienceYears).toBe(18);
    expect(result.story).toMatch(/family of traditional weavers/i);
  });

  it('extracts Tamil transliterated name phrases', () => {
    const result = extractSellerProfileFields('yennodiya peyar Shashank');
    expect(result.name).toBe('Shashank');
  });

  it('extracts Hindi transliterated name phrases', () => {
    expect(extractSellerProfileFields('mera naam Shashank hai').name).toBe('Shashank');
    expect(extractSellerProfileFields('mera naam Shashank h').name).toBe('Shashank');
    expect(extractSellerProfileFields('Mayan Anam Sashankha.').name).toBe('Shashank');
  });

  it('extracts Tamil native-script name phrases', () => {
    const result = extractSellerProfileFields('என்னுடைய பெயர் ஷஷாங்க்');
    expect(result.name).toMatch(/ஷஷாங்க்|Shashank/i);
  });

  it('does not invent missing fields', () => {
    const result = extractSellerProfileFields('My email is only.here@example.com');
    expect(result.email).toBe('only.here@example.com');
    expect(result.name).toBeUndefined();
    expect(result.story).toBeUndefined();
    expect(result.location).toBeUndefined();
  });
});
