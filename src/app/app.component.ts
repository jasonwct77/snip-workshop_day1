import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { LinkApiService, ShortLink } from './link-api.service';

const httpUrlValidator: ValidatorFn = (control): ValidationErrors | null => {
  const value = String(control.value ?? '').trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  private readonly api = inject(LinkApiService);

  readonly links = signal<ShortLink[]>([]);
  readonly isLoading = signal(true);
  readonly isSubmitting = signal(false);
  readonly createdLink = signal<ShortLink | null>(null);
  readonly formError = signal('');
  readonly linksError = signal('');

  readonly form = new FormGroup({
    url: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(2048), httpUrlValidator]
    })
  });

  get urlControl(): FormControl<string> {
    return this.form.controls.url;
  }

  ngOnInit(): void {
    this.refreshLinks();
  }

  submit(): void {
    this.formError.set('');
    this.createdLink.set(null);
    this.urlControl.markAsTouched();

    if (this.form.invalid || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.api.createLink(this.urlControl.value.trim()).subscribe({
      next: (link) => {
        this.createdLink.set(link);
        this.form.reset();
        this.isSubmitting.set(false);
        this.refreshLinks();
      },
      error: (error: HttpErrorResponse) => {
        this.isSubmitting.set(false);
        if (error.status === 400) {
          this.urlControl.setErrors({
            ...this.urlControl.errors,
            server: this.readServerError(error)
          });
          this.urlControl.markAsTouched();
        } else {
          this.formError.set('We could not reach Snip. Check your connection and try again.');
        }
      }
    });
  }

  refreshLinks(): void {
    this.isLoading.set(true);
    this.linksError.set('');
    this.api.getLinks().subscribe({
      next: (links) => {
        this.links.set(links);
        this.isLoading.set(false);
      },
      error: () => {
        this.linksError.set('Links could not be loaded. Please try again.');
        this.isLoading.set(false);
      }
    });
  }

  private readServerError(error: HttpErrorResponse): string {
    const message = error.error?.error;
    return typeof message === 'string' ? message : 'Please enter a valid HTTP or HTTPS URL.';
  }
}
