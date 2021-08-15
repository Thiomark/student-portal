import { Component, Input, OnInit } from '@angular/core';
import { Location } from '@angular/common';
import { PortalService } from 'src/app/services/portal.service';

@Component({
  selector: 'app-myprofile',
  templateUrl: './myprofile.component.html',
  styleUrls: ['./myprofile.component.scss']
})
export class MyprofileComponent implements OnInit {

  constructor(private _location: Location) { }

  cancelClicked() {
    this._location.back();
  }

  ngOnInit(): void {
  }

}

@Component({
  selector: 'app-inputshort',
  template: `
    <div>
      <label for="state" class="block text-sm font-medium text-gray-700">{{inputImportant}} {{ inputTitle }}</label>
      <input autocomplete="false" type="text" name="hidden" class="mt-1 block w-full sm:text-sm border-b border-gray-200 focus:border-gray-400 bg-gray-100 rounded-md focus:outline-none py-1 px-4">
    </div>
  `
})
export class InputShortComponent implements OnInit {
  currentUser: any = null
  @Input('input-title') inputTitle: String = ''
  @Input('input-important') inputImportant: string = "*";
  @Input('current-input') currentInput: string = ''
  input:string = ''

  constructor(private portal: PortalService) { }

  ngOnInit(): void {
    // this.portal.fetch('user')
    // .subscribe((response: any) => {
    //   this.currentUser = response.rows[0]
    // })
  }
}
