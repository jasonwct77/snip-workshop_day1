import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the links table', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    http.expectOne('http://localhost:3000/api/links').flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No links yet.');
  });

  it('rejects non-http URLs before sending a request', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('http://localhost:3000/api/links').flush([]);

    const app = fixture.componentInstance;
    app.form.controls.url.setValue('javascript:alert(1)');
    app.submit();

    expect(app.form.controls.url.hasError('httpUrl')).toBeTrue();
  });

  it('creates a short link and refreshes the table', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('http://localhost:3000/api/links').flush([]);

    const app = fixture.componentInstance;
    app.form.controls.url.setValue('https://example.com/a-long-page');
    app.submit();

    http.expectOne('http://localhost:3000/api/links').flush({
      code: 'a1B2c3',
      url: 'https://example.com/a-long-page',
      shortUrl: 'http://localhost:3000/a1B2c3',
      hits: 0,
      createdAt: '2026-01-01T00:00:00.000Z'
    }, { status: 201, statusText: 'Created' });
    http.expectOne('http://localhost:3000/api/links').flush([{
      code: 'a1B2c3',
      url: 'https://example.com/a-long-page',
      shortUrl: 'http://localhost:3000/a1B2c3',
      hits: 0,
      createdAt: '2026-01-01T00:00:00.000Z'
    }]);

    expect(app.createdLink()?.code).toBe('a1B2c3');
    expect(app.links().length).toBe(1);
    expect(app.isSubmitting()).toBeFalse();
  });

  it('shows API validation errors beside the URL field', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('http://localhost:3000/api/links').flush([]);

    const app = fixture.componentInstance;
    app.form.controls.url.setValue('https://example.com');
    app.submit();
    http.expectOne('http://localhost:3000/api/links').flush(
      { error: 'URL is not allowed' },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(app.form.controls.url.getError('server')).toBe('URL is not allowed');
    expect(app.isSubmitting()).toBeFalse();
  });
});
